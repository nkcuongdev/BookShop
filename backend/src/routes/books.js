const express = require("express");
const Book = require("../models/Book");
const Review = require("../models/Review");
const Order = require("../models/Order");
const Promotion = require("../models/Promotion");
const { auth, adminOnly, optionalAuth } = require("../middleware/auth");
const { parsePositiveInt } = require("../utils/security");

const router = express.Router();

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
    (userObj?.email ? String(userObj.email).split("@")[0] : "") ||
    "Khách hàng";

  return {
    ...obj,
    id: obj._id,
    userName,
    userId: reviewUserId,
  };
}

async function serializeExistingUserReview(review, user) {
  if (!review.userName && user?.name) {
    review.userName = user.name;
    await review.save();
  }

  await review.populate("user", "name email");
  return serializeReview(review, user);
}

async function createReviewWithIndexRepair(payload) {
  try {
    return await Review.create(payload);
  } catch (error) {
    if (error.code !== 11000) throw error;

    console.warn("Duplicate review write, repairing indexes and retrying", {
      keyPattern: error.keyPattern,
      keyValue: error.keyValue,
    });
    await Review.ensureReviewIndexes();
    return Review.create(payload);
  }
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
      tag,
      publisher,
    } = req.query;
    const useRaw = String(req.query?.raw || "") === "1" && req.user?.role === "admin";
    const pageNumber = parsePositiveInt(page, 1, 10_000);
    const limitNumber = limit ? parsePositiveInt(limit, 20, 100) : undefined;

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
      tag,
      publisher,
      includeInactive: useRaw,
    };

    const books = await Book.findWithFilters(options);

    const total = await Book.countWithFilters(options);
    const decorated = useRaw
      ? books.map((b) => ({ ...b.toObject(), id: b._id }))
      : await Promotion.decorateBooks(books);

    res.json({
      success: true,
      data: {
        books: decorated,
        pagination: {
          total,
          page: pageNumber,
          limit: limitNumber || decorated.length,
          totalPages: limitNumber ? Math.ceil(total / limitNumber) : 1,
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

// Get best sellers (public)
router.get("/best-sellers", async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 8, 50);
    const books = await Book.getBestSellers(limit);
    const decorated = await Promotion.decorateBooks(books);

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
    const decorated = await Promotion.decorateBooks(books);

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

// Get single book (public)
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const includeInactive = String(req.query?.raw || "") === "1" && req.user?.role === "admin";
    const book = includeInactive
      ? await Book.findById(req.params.id)
      : await Book.findOne({ _id: req.params.id, status: "active" });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sách",
      });
    }

    const reviews = await Review.getByBook(req.params.id);
    const useRaw = includeInactive;
    const decorated = useRaw
      ? { ...book.toObject(), id: book._id }
      : (await Promotion.decorateBooks([book]))[0];

    res.json({
      success: true,
      data: {
        book: decorated,
        reviews: reviews.map((r) => serializeReview(r, req.user)),
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

    const reviews = await Review.getByBook(req.params.id);

    res.json({
      success: true,
      data: {
        reviews: reviews.map((r) => serializeReview(r)),
        averageRating: book.rating,
        reviewCount: book.reviewCount,
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
    const { rating, comment = "" } = req.body || {};
    const numericRating = Number(rating);
    const normalizedComment = String(comment || "").trim();

    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sách",
      });
    }

    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
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

    const review = await createReviewWithIndexRepair({
      book: bookId,
      user: req.user._id,
      userName: req.user.name || "",
      rating: numericRating,
      comment: normalizedComment,
    });

    await Book.updateRating(bookId);
    const [updatedBook, populatedReview] = await Promise.all([
      Book.findById(bookId),
      Review.findById(review._id).populate("user", "name"),
    ]);

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

// Whitelist of fields the admin is allowed to write.
const ALLOWED_BOOK_FIELDS = [
  "title",
  "author",
  "description",
  "price",
  "imageUrl",
  "category",
  "stock",
  "status",
  "publisher",
  "publishedDate",
  "isbn",
  "pages",
  "language",
  "weight",
  "dimensions",
  "tags",
  "gallery",
  "attributes",
];

function pickBookPayload(body = {}) {
  const payload = {};
  for (const key of ALLOWED_BOOK_FIELDS) {
    if (body[key] !== undefined) payload[key] = body[key];
  }

  // Normalize attributes: drop empty keys, trim.
  if (Array.isArray(payload.attributes)) {
    payload.attributes = payload.attributes
      .map((a) => ({
        key: String(a?.key || "").trim(),
        value: String(a?.value ?? ""),
      }))
      .filter((a) => a.key);
  }

  // Normalize arrays of strings.
  if (Array.isArray(payload.tags)) {
    payload.tags = payload.tags.map((t) => String(t).trim()).filter(Boolean);
  }
  if (Array.isArray(payload.gallery)) {
    payload.gallery = payload.gallery
      .map((g) => String(g).trim())
      .filter(Boolean);
  }

  // Empty string -> null for optional scalars that are typed Number/Date.
  ["pages", "weight"].forEach((k) => {
    if (payload[k] === "" || payload[k] === null) payload[k] = null;
  });
  if (payload.publishedDate === "" || payload.publishedDate === null) {
    payload.publishedDate = null;
  }

  return payload;
}

// Create book (admin only)
router.post("/", auth, adminOnly, async (req, res) => {
  try {
    const payload = pickBookPayload(req.body);

    if (!payload.title || !payload.author || payload.price == null || !payload.category) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ thông tin",
      });
    }

    const book = new Book(payload);
    await book.save();

    res.status(201).json({
      success: true,
      message: "Thêm sách thành công",
      data: { book: { ...book.toObject(), id: book._id } },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Update book (admin only)
router.put("/:id", auth, adminOnly, async (req, res) => {
  try {
    const payload = pickBookPayload(req.body);
    const book = await Book.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sách",
      });
    }

    res.json({
      success: true,
      message: "Cập nhật thành công",
      data: { book: { ...book.toObject(), id: book._id } },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Delete book (admin only)
router.delete("/:id", auth, adminOnly, async (req, res) => {
  try {
    const [orderCount, reviewCount] = await Promise.all([
      Order.countDocuments({ "items.book": req.params.id }),
      Review.countDocuments({ book: req.params.id }),
    ]);
    if (orderCount > 0 || reviewCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Sach da co don hang hoac danh gia, hay chuyen sang inactive",
      });
    }

    const book = await Book.findByIdAndDelete(req.params.id);

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
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

module.exports = router;
