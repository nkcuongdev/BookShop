const express = require("express");
const Book = require("../models/Book");
const Review = require("../models/Review");
const Order = require("../models/Order");
const { auth, adminOnly } = require("../middleware/auth");

const router = express.Router();

// Get all books (public)
router.get("/", async (req, res) => {
  try {
    const { category, search, sortBy, order, page, limit } = req.query;

    const books = await Book.findWithFilters({
      category,
      search,
      sortBy,
      order: order || "desc",
      page: parseInt(page) || 1,
      limit: limit ? parseInt(limit) : undefined,
    });

    const total = await Book.countDocuments(category ? { category } : {});

    res.json({
      success: true,
      data: {
        books: books.map((b) => ({ ...b.toObject(), id: b._id })),
        pagination: {
          total,
          page: parseInt(page) || 1,
          limit: limit ? parseInt(limit) : total,
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
    const limit = parseInt(req.query.limit) || 8;
    const books = await Book.getBestSellers(limit);

    res.json({
      success: true,
      data: { books: books.map((b) => ({ ...b.toObject(), id: b._id })) },
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
    const limit = parseInt(req.query.limit) || 8;
    const books = await Book.getNewArrivals(limit);

    res.json({
      success: true,
      data: { books: books.map((b) => ({ ...b.toObject(), id: b._id })) },
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
router.get("/:id", async (req, res) => {
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
        book: { ...book.toObject(), id: book._id },
        reviews: reviews.map((r) => ({
          ...r.toObject(),
          id: r._id,
          userName: r.user?.name || "Anonymous",
          userId: r.user?._id,
        })),
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
        reviews: reviews.map((r) => ({
          ...r.toObject(),
          id: r._id,
          userName: r.user?.name || "Anonymous",
        })),
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
    const { rating, comment } = req.body;

    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sách",
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Đánh giá phải từ 1 đến 5 sao",
      });
    }

    // Check if user can review
    const canReview = await Review.canUserReview(req.user._id, bookId);
    if (!canReview) {
      return res.status(403).json({
        success: false,
        message: "Bạn chỉ có thể đánh giá sách đã mua",
      });
    }

    // Create review
    const review = new Review({
      book: bookId,
      user: req.user._id,
      rating: parseInt(rating),
      comment: comment || "",
    });
    await review.save();

    // Update book rating
    await Book.updateRating(bookId);
    const updatedBook = await Book.findById(bookId);

    res.status(201).json({
      success: true,
      message: "Đánh giá thành công",
      data: {
        review: {
          ...review.toObject(),
          id: review._id,
          userName: req.user.name,
        },
        bookRating: updatedBook.rating,
        bookReviewCount: updatedBook.reviewCount,
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

// Check if user can review a book
router.get("/:id/can-review", auth, async (req, res) => {
  try {
    const bookId = req.params.id;
    const existingReview = await Review.findOne({
      user: req.user._id,
      book: bookId,
    });
    const hasPurchased = await Order.hasUserPurchasedBook(req.user._id, bookId);

    res.json({
      success: true,
      data: {
        canReview: hasPurchased && !existingReview,
        hasPurchased,
        hasReviewed: !!existingReview,
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

// Create book (admin only)
router.post("/", auth, adminOnly, async (req, res) => {
  try {
    const { title, author, description, price, imageUrl, category, stock } =
      req.body;

    if (!title || !author || !price || !category) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ thông tin",
      });
    }

    const book = new Book({
      title,
      author,
      description,
      price,
      imageUrl,
      category,
      stock: stock || 0,
    });
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
    const book = await Book.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
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
