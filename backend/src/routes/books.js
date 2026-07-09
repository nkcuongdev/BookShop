const express = require("express");
const mongoose = require("mongoose");
const Book = require("../models/Book");
const StockLedger = require("../models/StockLedger");
const Review = require("../models/Review");
const ReviewReport = require("../models/ReviewReport");
const Order = require("../models/Order");
const Promotion = require("../models/Promotion");
const PromotionAlertDelivery = require("../models/PromotionAlertDelivery");
const Cart = require("../models/Cart");
const User = require("../models/User");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const { auth, optionalAuth, requirePermission } = require("../middleware/auth");
const roleRegistry = require("../services/roleRegistry");
const { parsePositiveInt } = require("../utils/security");
const { runInTransaction } = require("../utils/transaction");
const {
  claimReviewAssets,
  queueRemovedReviewAssets,
  syncBookAssets,
  queueBookAssetsForDeletion,
} = require("../services/assetLifecycleService");
const {
  normalizeBookCategory,
  pickBookPayload,
  validateRequiredBookFields,
} = require("../validators/bookValidator");
const { getRecommendations } = require("../services/recommendationService");
const { toPublicBook, toPublicBooks } = require("../serializers/bookSerializer");
const auditLogService = require("../services/auditLogService");
const { FIELD_LABELS } = require("../services/auditLogPresenter");
const { resolveBookMetadata } = require("../services/bookMetadataService");

const router = express.Router();

async function assertIsbnAvailable(isbn, { excludeBookId = null, session = null } = {}) {
  if (!isbn) return;
  const filter = {
    $or: [{ isbn }, { isbnNormalized: isbn }, { isbnKey: isbn }],
  };
  if (excludeBookId) filter._id = { $ne: excludeBookId };
  const duplicate = await Book.exists(filter).session(session);
  if (duplicate) {
    const error = new Error("ISBN này đã được dùng cho một ấn bản khác");
    error.statusCode = 409;
    error.code = "ISBN_ALREADY_EXISTS";
    throw error;
  }
}

async function assertEditionGroupExists(editionGroup, session) {
  if (!editionGroup) return;
  const exists = await Book.exists({ _id: editionGroup }).session(session);
  if (!exists) {
    const error = new Error("Không tìm thấy tác phẩm gốc của nhóm ấn bản");
    error.statusCode = 422;
    error.code = "EDITION_GROUP_NOT_FOUND";
    throw error;
  }
}

function serializeReview(review, fallbackUser = null) {
  const obj = review.toObject ? review.toObject() : review;
  const userObj = obj.user && typeof obj.user === "object" ? obj.user : null;
  const fallbackUserId = fallbackUser?._id || fallbackUser?.id;
  const reviewUserId = userObj?._id || obj.user;
  const fallbackName =
    fallbackUserId && String(reviewUserId) === String(fallbackUserId)
      ? fallbackUser.name
      : "";
  const userName =
    obj.userName ||
    userObj?.name ||
    fallbackName ||
    "Khách hàng";

  return {
    _id: obj._id,
    id: obj._id,
    userName,
    userId: reviewUserId,
    rating: obj.rating,
    comment: obj.comment,
    images: Array.isArray(obj.images) ? obj.images : [],
    verified: true,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

async function serializeExistingUserReview(review, user) {
  if (!review.userName && user?.name) {
    review.userName = user.name;
    await review.save();
  }

  await review.populate("user", "name");
  return serializeReview(review, user);
}

async function createReviewWithIndexRepair(payload, session) {
  const [review] = await Review.create([payload], { session });
  return review;
}

function parseReviewPayload(body = {}) {
  const rating = Number(body.rating);
  const comment = String(body.comment || "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Đánh giá phải từ 1 đến 5 sao" };
  }
  if (comment.length < 10 || comment.length > 500) {
    return { error: "Nhận xét cần từ 10 đến 500 ký tự" };
  }
  return { rating, comment };
}

// Get all books (public)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const {
      category,
      search,
      sortBy,
      sort,
      order,
      page,
      limit,
      minPrice,
      maxPrice,
      minRating,
      rating,
      inStock,
      stock,
      stockStatus,
      tag,
      publisher,
      author,
      language,
    } = req.query;
    const useRaw =
      String(req.query?.raw || "") === "1" &&
      (await roleRegistry.roleHasPermission(req.user?.role, "book.read"));
    const pageNumber = parsePositiveInt(page, 1, 10_000);
    const limitNumber = parsePositiveInt(limit, 20, 100);

    const options = {
      category,
      search,
      sortBy: sortBy || sort,
      order: order || "desc",
      page: pageNumber,
      limit: limitNumber,
      minPrice,
      maxPrice,
      minRating: minRating || rating,
      inStock: inStock ?? stock,
      stockStatus,
      tag,
      publisher,
      author,
      language,
      includeInactive: useRaw,
    };

    const [books, total] = await Promise.all([
      Book.findWithFilters(options),
      Book.countWithFilters(options),
    ]);
    // Sorting by discounted price already prices the slice, so decorating it a
    // second time would compound the discount.
    const alreadyPriced = books.length > 0 && books.every((b) => b.__decorated);
    const decorated = useRaw
      ? books.map((b) => ({ ...b, id: b._id }))
      : toPublicBooks(alreadyPriced ? books : await Promotion.decorateBooks(books));

    res.json({
      success: true,
      data: {
        books: decorated,
        pagination: {
          total,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(total / limitNumber),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Curated, bounded payload for the home page. It avoids downloading the full catalog.
let homePayloadCache = null;
let homePayloadExpiresAt = 0;
const HOME_CACHE_TTL_MS = 30_000;

router.get("/home", async (_req, res) => {
  try {
    res.set("Cache-Control", "public, max-age=15, stale-while-revalidate=45");
    if (homePayloadCache && homePayloadExpiresAt > Date.now()) {
      return res.json(homePayloadCache);
    }
    const publicFields = {
      title: 1,
      author: 1,
      price: 1,
      imageUrl: 1,
      category: 1,
      stock: 1,
      sold: 1,
      rating: 1,
      reviewCount: 1,
      createdAt: 1,
    };
    const promotions = await Promotion.getRunningPromotions();
    const promotedBookIds = promotions.flatMap((promotion) =>
      promotion.scope === "products" ? promotion.books || [] : []
    );
    const promotedCategories = promotions
      .filter((promotion) => promotion.scope === "category" && promotion.category)
      .map((promotion) => promotion.category);
    const promotionFilter = [];
    if (promotedBookIds.length) promotionFilter.push({ _id: { $in: promotedBookIds } });
    if (promotedCategories.length) promotionFilter.push({ category: { $in: promotedCategories } });

    const [bestSellers, newArrivals, categoryGroups, promotionCandidates] =
      await Promise.all([
        Book.find({ status: "active" }, publicFields)
          .sort({ sold: -1, _id: 1 })
          .limit(10)
          .lean(),
        Book.find({ status: "active" }, publicFields)
          .sort({ createdAt: -1, _id: 1 })
          .limit(10)
          .lean(),
        Book.aggregate([
          { $match: { status: "active" } },
          { $project: publicFields },
          {
            $group: {
              _id: "$category",
              books: {
                $topN: {
                  n: 5,
                  sortBy: { sold: -1, _id: 1 },
                  output: "$$ROOT",
                },
              },
            },
          },
        ]),
        promotionFilter.length
          ? Book.find(
              { status: "active", stock: { $gt: 0 }, $or: promotionFilter },
              publicFields
            )
              .sort({ rating: -1, sold: -1, _id: 1 })
              .limit(50)
              .lean()
          : [],
      ]);

    const uniqueBooks = new Map();
    for (const book of [
      ...bestSellers,
      ...newArrivals,
      ...categoryGroups.flatMap((group) => group.books),
      ...promotionCandidates,
    ]) {
      uniqueBooks.set(String(book._id), book);
    }
    const decorated = toPublicBooks(
      await Promotion.decorateBooks([...uniqueBooks.values()], { promotions })
    );
    const decoratedById = new Map(decorated.map((book) => [String(book._id), book]));
    const resolveBooks = (books) =>
      books.map((book) => decoratedById.get(String(book._id)) || book);
    const booksByCategory = Object.fromEntries(
      categoryGroups.map((group) => [String(group._id), resolveBooks(group.books)])
    );
    const flashSale = resolveBooks(promotionCandidates)
      .filter((book) => book.discountPercent > 0)
      .slice(0, 10);

    const payload = {
      success: true,
      data: {
        bestSellers: resolveBooks(bestSellers),
        newArrivals: resolveBooks(newArrivals),
        flashSale,
        booksByCategory,
      },
    };
    homePayloadCache = payload;
    homePayloadExpiresAt = Date.now() + HOME_CACHE_TTL_MS;
    return res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// Personalized recommendations use private history and must never share the
// public home-page cache. Anonymous visitors are identified by their analytics
// session; signed-in visitors combine that session with durable order history.
router.get("/recommendations", optionalAuth, async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || "").trim();
    if (sessionId && !/^[a-zA-Z0-9_-]{8,128}$/.test(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Phiên gợi ý không hợp lệ",
      });
    }
    const limit = parsePositiveInt(req.query.limit, 10, 20);
    const result = await getRecommendations({
      userId: req.user?._id || null,
      sessionId,
      limit,
    });
    res.set("Cache-Control", "private, no-store");
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Không thể tải gợi ý sách",
      error: error.message,
    });
  }
});

// Get best sellers (public)
router.get("/best-sellers", async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 8, 50);
    const books = await Book.getBestSellers(limit);
    const decorated = toPublicBooks(await Promotion.decorateBooks(books));

    res.json({
      success: true,
      data: { books: decorated },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Get new arrivals (public)
router.get("/new-arrivals", async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 8, 50);
    const books = await Book.getNewArrivals(limit);
    const decorated = toPublicBooks(await Promotion.decorateBooks(books));

    res.json({
      success: true,
      data: { books: decorated },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Facet values for the catalogue filter UI. Declared before "/:id" so the
// literal path is not swallowed by the parameterised route.
let facetsCache = null;
let facetsExpiresAt = 0;
const FACETS_CACHE_TTL_MS = 5 * 60_000;
const FACET_LIMIT = 100;

router.get("/facets", async (_req, res) => {
  try {
    res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
    if (facetsCache && facetsExpiresAt > Date.now()) {
      return res.json(facetsCache);
    }

    // One pass over the active catalogue, counting each value so the UI can put
    // the most common options first instead of listing everything.
    const [rows] = await Book.aggregate([
      { $match: { status: "active" } },
      {
        $facet: {
          authors: [
            { $match: { author: { $nin: ["", null] } } },
            {
              $group: {
                _id: {
                  value: { $ifNull: ["$authorId", "$author"] },
                  label: "$author",
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1, "_id.label": 1 } },
            { $limit: FACET_LIMIT },
          ],
          publishers: [
            { $match: { publisher: { $nin: ["", null] } } },
            {
              $group: {
                _id: {
                  value: { $ifNull: ["$publisherId", "$publisher"] },
                  label: "$publisher",
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1, "_id.label": 1 } },
            { $limit: FACET_LIMIT },
          ],
          languages: [
            { $match: { language: { $nin: ["", null] } } },
            { $group: { _id: "$language", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: FACET_LIMIT },
          ],
        },
      },
    ]);

    const toOptions = (entries = []) =>
      entries.map((entry) => {
        const structured = entry._id && typeof entry._id === "object";
        return {
          value: String(structured ? entry._id.value : entry._id),
          label: String(structured ? entry._id.label : entry._id),
          count: entry.count,
        };
      });

    const payload = {
      success: true,
      data: {
        authors: toOptions(rows?.authors),
        publishers: toOptions(rows?.publishers),
        languages: toOptions(rows?.languages),
      },
    };
    facetsCache = payload;
    facetsExpiresAt = Date.now() + FACETS_CACHE_TTL_MS;
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Không thể tải bộ lọc",
      error: error.message,
    });
  }
});

// Get single book (public)
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const includeInactive =
      String(req.query?.raw || "") === "1" &&
      (await roleRegistry.roleHasPermission(req.user?.role, "book.read"));
    const book = includeInactive
      ? await Book.findById(req.params.id)
      : await Book.findOne({ _id: req.params.id, status: "active" });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sách",
      });
    }

    const reviewPage = parsePositiveInt(req.query.reviewPage, 1, 10_000);
    const reviewLimit = parsePositiveInt(req.query.reviewLimit, 10, 50);
    const [reviews, ratingStats] = await Promise.all([
      Review.getByBook(req.params.id, { page: reviewPage, limit: reviewLimit }),
      Review.getRatingBreakdown(req.params.id),
    ]);
    const reviewTotal = ratingStats.total;
    const useRaw = includeInactive;
    const decorated = useRaw
      ? { ...book.toObject(), id: book._id }
      : toPublicBook((await Promotion.decorateBooks([book]))[0]);

    res.json({
      success: true,
      data: {
        book: decorated,
        reviews: reviews.map((r) => serializeReview(r, req.user)),
        // Counts every visible review, so the histogram does not shift as the
        // reader pages through the list.
        ratingBreakdown: ratingStats.breakdown,
        reviewPagination: {
          total: reviewTotal,
          page: reviewPage,
          limit: reviewLimit,
          totalPages: Math.ceil(reviewTotal / reviewLimit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// GET /api/books/:id/reviews - Get reviews for a book
router.get("/:id/reviews", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sách",
      });
    }

    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 10, 50);
    const rating = req.query.rating ? Number(req.query.rating) : null;
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        message: "Bộ lọc số sao không hợp lệ",
      });
    }
    const filter = { book: req.params.id, status: { $ne: "hidden" } };
    if (rating !== null) filter.rating = rating;
    const [reviews, total, ratingStats] = await Promise.all([
      Review.getByBook(req.params.id, { page, limit, rating }),
      Review.countDocuments(filter),
      Review.getRatingBreakdown(req.params.id),
    ]);

    res.json({
      success: true,
      data: {
        reviews: reviews.map((r) => serializeReview(r)),
        averageRating: book.rating,
        reviewCount: book.reviewCount,
        // Spans every star regardless of the active rating filter, so the
        // histogram keeps its shape while a single star is selected.
        ratingBreakdown: ratingStats.breakdown,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// POST /api/books/:id/reviews - Create review
router.post("/:id/reviews", auth, async (req, res) => {
  try {
    const bookId = req.params.id;
    const { rating, comment = "", images = [] } = req.body || {};
    const numericRating = Number(rating);
    const normalizedComment = String(comment || "").trim();

    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sách",
      });
    }

    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        message: "Đánh giá phải từ 1 đến 5 sao",
      });
    }

    if (normalizedComment.length < 10 || normalizedComment.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Nhận xét cần từ 10 đến 500 ký tự",
      });
    }

    const existingReview = await Review.findOne({
      user: req.user._id,
      book: bookId,
    });

    if (existingReview) {
      const [updatedBook, reviewData] = await Promise.all([
        Book.findById(bookId),
        serializeExistingUserReview(existingReview, req.user),
      ]);

      return res.json({
        success: true,
        message: "Bạn đã đánh giá sách này rồi",
        data: {
          alreadyReviewed: true,
          review: reviewData,
          bookRating: updatedBook?.rating || 0,
          bookReviewCount: updatedBook?.reviewCount || 0,
        },
      });
    }

    const hasPurchased = await Order.hasUserPurchasedBook(req.user._id, bookId);
    if (!hasPurchased) {
      return res.status(403).json({
        success: false,
        message: "Bạn chỉ có thể đánh giá sách đã mua và đã giao",
      });
    }

    const claimedReviewId = new mongoose.Types.ObjectId();
    const { reviewId, updatedBook } = await runInTransaction(async (session) => {
      const claimedImages = await claimReviewAssets(
        claimedReviewId,
        req.user._id,
        images,
        session
      );
      const review = await createReviewWithIndexRepair(
        {
          _id: claimedReviewId,
          book: bookId,
          user: req.user._id,
          userName: req.user.name || "",
          rating: numericRating,
          comment: normalizedComment,
          images: claimedImages,
        },
        session
      );
      const aggregate = await Book.addRating(bookId, numericRating, { session });
      if (!aggregate) {
        const error = new Error("Không tìm thấy sách");
        error.statusCode = 404;
        throw error;
      }
      return { reviewId: review._id, updatedBook: aggregate };
    });
    const populatedReview = await Review.findById(reviewId).populate("user", "name");

    res.status(201).json({
      success: true,
      message: "Đánh giá thành công",
      data: {
        review: {
          ...serializeReview(populatedReview, req.user),
        },
        bookRating: updatedBook?.rating || 0,
        bookReviewCount: updatedBook?.reviewCount || 0,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    }
    if (error.code === 11000) {
      const existingReview = await Review.findOne({
        user: req.user._id,
        book: req.params.id,
      });

      if (existingReview) {
        const [updatedBook, reviewData] = await Promise.all([
          Book.findById(req.params.id),
          serializeExistingUserReview(existingReview, req.user),
        ]);

        return res.json({
          success: true,
          message: "Bạn đã đánh giá sách này rồi",
          data: {
            alreadyReviewed: true,
            review: reviewData,
            bookRating: updatedBook?.rating || 0,
            bookReviewCount: updatedBook?.reviewCount || 0,
          },
        });
      }

      return res.status(409).json({
        success: false,
        message: "Đánh giá đã tồn tại",
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Dữ liệu đánh giá không hợp lệ",
      });
    }

    res.status(500).json({
      success: false,
      message: "Không thể gửi đánh giá, vui lòng thử lại",
      error: error.message,
    });
  }
});

// Check if user can review a book
router.get("/:id/can-review", auth, async (req, res) => {
  try {
    const bookId = req.params.id;
    const [existingReview, hasPurchased] = await Promise.all([
      Review.findOne({
        user: req.user._id,
        book: bookId,
      }),
      Order.hasUserPurchasedBook(req.user._id, bookId),
    ]);

    res.json({
      success: true,
      data: {
        canReview: hasPurchased && !existingReview,
        hasPurchased,
        hasReviewed: !!existingReview,
        message: existingReview
          ? "Bạn đã đánh giá sách này rồi"
          : hasPurchased
            ? ""
            : "Bạn chỉ có thể đánh giá sách đã mua và đã giao",
      },
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Mã sách không hợp lệ",
      });
    }

    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Create book (admin only)
router.post("/", auth, requirePermission("book.write"), async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const payload = pickBookPayload(req.body);
    validateRequiredBookFields(payload);

    let book;
    await session.withTransaction(async () => {
      if (!(await normalizeBookCategory(payload, { session, lock: true }))) {
        const error = new Error("Danh mục không hợp lệ");
        error.statusCode = 400;
        error.code = "INVALID_CATEGORY";
        throw error;
      }
      await resolveBookMetadata(payload, session);
      await assertIsbnAvailable(payload.isbn, { session });
      await assertEditionGroupExists(payload.editionGroup, session);
      [book] = await Book.create([payload], { session });
      // Seed the ledger with the opening balance so reconciliation holds from
      // the first movement onwards.
      const openingStock = Number(book.stock) || 0;
      if (openingStock > 0) {
        await StockLedger.create(
          [
            {
              book: book._id,
              type: "ADJUSTMENT",
              quantity: openingStock,
              stockBefore: 0,
              stockAfter: openingStock,
              unitCost: Number(book.costPrice) || 0,
              reason: "Tồn kho ban đầu khi tạo sách",
              performedBy: req.user._id,
            },
          ],
          { session }
        );
      }
      await syncBookAssets(
        book._id,
        req.user._id,
        [book.imageUrl, ...(book.gallery || [])],
        session
      );
    });

    res.status(201).json({
      success: true,
      message: "Thêm sách thành công",
      data: { book: { ...book.toObject(), id: book._id } },
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.editionGroup) {
      return res.status(409).json({
        success: false,
        code: "EDITION_ALREADY_EXISTS",
        message: "Nhóm này đã có ấn bản cùng lần xuất bản và định dạng",
      });
    }
    if (error.code === 11000 && (error.keyPattern?.isbn || error.keyPattern?.isbnKey)) {
      return res.status(409).json({
        success: false,
        code: "ISBN_ALREADY_EXISTS",
        message: "ISBN này đã được dùng cho một ấn bản khác",
      });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    }
    return next(error);
  } finally {
    await session.endSession();
  }
});

// PATCH /api/books/:id/reviews/:reviewId - Edit the current user's review.
router.patch("/:id/reviews/:reviewId", auth, async (req, res) => {
  let review = null;
  try {
    const payload = parseReviewPayload(req.body);
    if (payload.error) {
      return res.status(400).json({ success: false, message: payload.error });
    }

    const { updatedBook } = await runInTransaction(async (session) => {
      review = await Review.findOne({
        _id: req.params.reviewId,
        book: req.params.id,
        user: req.user._id,
      }).session(session);
      if (!review) {
        const error = new Error("Không tìm thấy đánh giá thuộc tài khoản của bạn");
        error.statusCode = 404;
        throw error;
      }

      const oldRating = review.rating;
      const oldImages = Array.isArray(review.images) ? [...review.images] : [];
      const requestedImages = await claimReviewAssets(
        review._id,
        req.user._id,
        req.body?.images ?? oldImages,
        session
      );
      review.rating = payload.rating;
      review.comment = payload.comment;
      review.images = requestedImages;
      await review.save({ session });
      await queueRemovedReviewAssets(review._id, requestedImages, session);

      const aggregate =
        review.status !== "hidden" && oldRating !== review.rating
          ? await Book.adjustRating(
              req.params.id,
              review.rating - oldRating,
              0,
              { session }
            )
          : await Book.findById(req.params.id).session(session);
      if (!aggregate) {
        const error = new Error("Không tìm thấy sách");
        error.statusCode = 404;
        throw error;
      }
      return { updatedBook: aggregate };
    });
    review = await Review.findById(req.params.reviewId);
    await review.populate("user", "name");

    return res.json({
      success: true,
      message: "Đã cập nhật đánh giá",
      data: {
        review: serializeReview(review, req.user),
        bookRating: updatedBook?.rating || 0,
        bookReviewCount: updatedBook?.reviewCount || 0,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: "Dữ liệu đánh giá không hợp lệ" });
    }
    return res.status(500).json({ success: false, message: "Không thể cập nhật đánh giá" });
  }
});

// DELETE /api/books/:id/reviews/:reviewId - Delete the current user's review.
router.delete("/:id/reviews/:reviewId", auth, async (req, res) => {
  try {
    const { updatedBook } = await runInTransaction(async (session) => {
      const review = await Review.findOneAndDelete(
        {
          _id: req.params.reviewId,
          book: req.params.id,
          user: req.user._id,
        },
        { session }
      );
      if (!review) {
        const error = new Error("Không tìm thấy đánh giá thuộc tài khoản của bạn");
        error.statusCode = 404;
        throw error;
      }

      const aggregate =
        review.status !== "hidden"
          ? await Book.adjustRating(req.params.id, -review.rating, -1, { session })
          : await Book.findById(req.params.id).session(session);
      await ReviewReport.deleteMany({ review: review._id }, { session });
      await queueRemovedReviewAssets(review._id, [], session);
      return { updatedBook: aggregate };
    });

    return res.json({
      success: true,
      message: "Đã xóa đánh giá",
      data: {
        bookRating: updatedBook?.rating || 0,
        bookReviewCount: updatedBook?.reviewCount || 0,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    if (error.name === "CastError") {
      return res.status(400).json({ success: false, message: "Mã đánh giá không hợp lệ" });
    }
    return res.status(500).json({ success: false, message: "Không thể xóa đánh giá" });
  }
});

// POST /api/books/:id/reviews/:reviewId/report - Report a visible review once per user.
router.post("/:id/reviews/:reviewId/report", auth, async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    const details = String(req.body?.details || "").trim();
    if (!["spam", "abuse", "off_topic", "other"].includes(reason)) {
      return res.status(400).json({ success: false, message: "Lý do báo cáo không hợp lệ" });
    }
    if (details.length > 500) {
      return res.status(400).json({ success: false, message: "Chi tiết không quá 500 ký tự" });
    }

    const review = await Review.findOne({
      _id: req.params.reviewId,
      book: req.params.id,
      status: { $ne: "hidden" },
    });
    if (!review) {
      return res.status(404).json({ success: false, message: "Không tìm thấy đánh giá" });
    }
    if (String(review.user) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: "Bạn không thể báo cáo đánh giá của mình" });
    }

    try {
      await runInTransaction(async (session) => {
        const currentReview = await Review.findOne({
          _id: review._id,
          book: req.params.id,
          status: { $ne: "hidden" },
        }).session(session);
        if (!currentReview) {
          const error = new Error("Không tìm thấy đánh giá");
          error.statusCode = 404;
          throw error;
        }
        await ReviewReport.create(
          [{ review: review._id, reporter: req.user._id, reason, details }],
          { session }
        );
        await Review.updateOne(
          { _id: review._id },
          { $inc: { reportCount: 1 } },
          { session }
        );
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      return res.json({
        success: true,
        message: "Bạn đã báo cáo đánh giá này trước đó",
        data: { alreadyReported: true },
      });
    }

    return res.status(201).json({
      success: true,
      message: "Đã gửi báo cáo để quản trị viên xem xét",
      data: { alreadyReported: false },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    if (error.name === "CastError") {
      return res.status(400).json({ success: false, message: "Mã đánh giá không hợp lệ" });
    }
    return res.status(500).json({ success: false, message: "Không thể gửi báo cáo" });
  }
});

// Update book (admin only)
router.put("/:id", auth, requirePermission("book.write"), async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    // Stock is owned by the inventory ledger once the book exists; the
    // validator rejects any attempt to set it here.
    const payload = pickBookPayload(req.body, { mode: "update" });
    let book;
    // Hoisted out of the transaction callback so the audit entry can be
    // written after the commit, from the state the update actually replaced.
    let currentBook;
    await session.withTransaction(async () => {
      if (!(await normalizeBookCategory(payload, { session, lock: true }))) {
        const error = new Error("Danh mục không hợp lệ");
        error.statusCode = 400;
        error.code = "INVALID_CATEGORY";
        throw error;
      }
      await resolveBookMetadata(payload, session);
      if (payload.editionGroup === null) payload.editionGroup = req.params.id;
      await assertIsbnAvailable(payload.isbn, {
        excludeBookId: req.params.id,
        session,
      });
      await assertEditionGroupExists(payload.editionGroup, session);
      if (payload.isbn !== undefined) {
        payload.isbnKey = payload.isbn || null;
        payload.isbnNormalized = payload.isbn || null;
      }
      currentBook = await Book.findById(req.params.id)
        .select("stock imageUrl gallery title price originalPrice costPrice")
        .session(session);
      book = await Book.findByIdAndUpdate(req.params.id, payload, {
        returnDocument: "after",
        runValidators: true,
        session,
      });
      if (book) {
        await syncBookAssets(
          book._id,
          req.user._id,
          [book.imageUrl, ...(book.gallery || [])],
          session,
          currentBook
            ? [currentBook.imageUrl, ...(currentBook.gallery || [])]
            : []
        );
      }
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sách",
      });
    }

    // Price is the money-bearing field on a book, so a change to it is logged
    // with its old and new value. Recorded after the commit: an entry for a
    // change that got rolled back would be worse than no entry at all.
    await auditLogService.record({
      action: auditLogService.ACTIONS.BOOK_PRICE_UPDATE,
      actor: req.user,
      req,
      targetType: "Book",
      targetId: book._id,
      targetLabel: book.title,
      changes: auditLogService.diffFields(currentBook, book, {
        price: FIELD_LABELS.price,
        originalPrice: FIELD_LABELS.originalPrice,
        costPrice: FIELD_LABELS.costPrice,
      }),
    });

    res.json({
      success: true,
      message: "Cập nhật thành công",
      data: { book: { ...book.toObject(), id: book._id } },
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.editionGroup) {
      return res.status(409).json({
        success: false,
        code: "EDITION_ALREADY_EXISTS",
        message: "Nhóm này đã có ấn bản cùng lần xuất bản và định dạng",
      });
    }
    if (error.code === 11000 && (error.keyPattern?.isbn || error.keyPattern?.isbnKey)) {
      return res.status(409).json({
        success: false,
        code: "ISBN_ALREADY_EXISTS",
        message: "ISBN này đã được dùng cho một ấn bản khác",
      });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        // Surfacing the code lets the admin form tell "stock is not editable"
        // apart from a generic validation failure.
        code: error.code || undefined,
      });
    }
    return next(error);
  } finally {
    await session.endSession();
  }
});

// Delete book (admin only)
router.delete("/:id", auth, requirePermission("book.delete"), async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    let book;
    await session.withTransaction(async () => {
      // A MongoDB session may only execute one operation at a time. Keeping
      // these reads sequential also preserves their common transaction view.
      const orderCount = await Order.countDocuments({
        "items.book": req.params.id,
      }).session(session);
      const reviewCount = await Review.countDocuments({
        book: req.params.id,
      }).session(session);
      // Receipts, issues and stocktakes all point at the book through the
      // ledger. Deleting it would strand those documents and drop the
      // quantities and value out of every Book-based inventory report.
      const ledgerCount = await StockLedger.countDocuments({
        book: req.params.id,
      }).session(session);
      const existing = await Book.findById(req.params.id)
        .select("stock")
        .session(session)
        .lean();
      if (orderCount > 0 || reviewCount > 0) {
        const error = new Error(
          "Sach da co don hang hoac danh gia, hay chuyen sang inactive"
        );
        error.statusCode = 400;
        error.code = "BOOK_HAS_HISTORY";
        throw error;
      }
      if (ledgerCount > 0) {
        const error = new Error(
          "Sách đã có lịch sử kho (phiếu nhập/xuất/kiểm kho), hãy chuyển sang ngừng bán thay vì xoá"
        );
        error.statusCode = 400;
        error.code = "BOOK_HAS_STOCK_HISTORY";
        throw error;
      }
      if (existing && Number(existing.stock) > 0) {
        const error = new Error(
          `Sách còn tồn kho ${existing.stock}, hãy xuất hết hoặc chuyển sang ngừng bán trước khi xoá`
        );
        error.statusCode = 400;
        error.code = "BOOK_HAS_STOCK";
        throw error;
      }

      book = await Book.findByIdAndDelete(req.params.id, { session });
      if (!book) return;

      await Cart.updateMany(
        { "items.book": book._id },
        { $pull: { items: { book: book._id } } },
        { session }
      );
      await User.updateMany(
        { wishlist: book._id },
        { $pull: { wishlist: book._id } },
        { session }
      );
      await Promotion.updateMany(
        { books: book._id },
        { $pull: { books: book._id } },
        { session }
      );
      await PromotionAlertDelivery.deleteMany(
        { book: book._id },
        { session }
      );
      await AnalyticsEvent.updateMany(
        { book: book._id },
        { $set: { book: null } },
        { session }
      );
      await queueBookAssetsForDeletion(book._id, session);
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sách",
      });
    }

    res.json({
      success: true,
      message: "Xóa sách thành công",
      data: { book: { ...book.toObject(), id: book._id } },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code || undefined,
      });
    }
    return next(error);
  } finally {
    await session.endSession();
  }
});

module.exports = router;
