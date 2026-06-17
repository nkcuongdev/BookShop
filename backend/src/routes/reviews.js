const express = require("express");
const Review = require("../models/Review");
const Book = require("../models/Book");
const Order = require("../models/Order");
const { auth } = require("../middleware/auth");

const router = express.Router();

function serializeReview(review) {
  const obj = review.toObject ? review.toObject() : review;
  return {
    ...obj,
    id: obj._id,
    userName: obj.user?.name || "Anonymous",
    userId: obj.user?._id || obj.user,
  };
}

router.get("/book/:bookId", async (req, res) => {
  try {
    const reviews = await Review.getByBook(req.params.bookId);
    const count = reviews.length;
    const averageRating = count
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10
      : 0;

    res.json({
      success: true,
      data: {
        reviews: reviews.map(serializeReview),
        averageRating,
        count,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

router.get("/can-review/:bookId", auth, async (req, res) => {
  try {
    const [hasPurchased, hasReviewed] = await Promise.all([
      Order.hasUserPurchasedBook(req.user._id, req.params.bookId),
      Review.exists({ user: req.user._id, book: req.params.bookId }),
    ]);

    res.json({
      success: true,
      data: {
        canReview: hasPurchased && !hasReviewed,
        hasPurchased,
        hasReviewed: !!hasReviewed,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const { bookId, rating, comment = "" } = req.body || {};
    const numericRating = Number(rating);

    if (!bookId || !Number.isFinite(numericRating)) {
      return res.status(400).json({ success: false, message: "Book ID and rating are required" });
    }
    if (numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
    }

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });

    const canReview = await Review.canUserReview(req.user._id, bookId);
    if (!canReview) {
      return res.status(403).json({
        success: false,
        message: "You can only review delivered books once",
      });
    }

    const review = await Review.create({
      book: bookId,
      user: req.user._id,
      rating: numericRating,
      comment: String(comment || "").trim(),
    });
    await Book.updateRating(bookId);
    await review.populate("user", "name");

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      data: { review: serializeReview(review) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });
    if (String(review.user) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "You can only edit your own reviews" });
    }

    const { rating, comment } = req.body || {};
    if (rating !== undefined) {
      const numericRating = Number(rating);
      if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
        return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
      }
      review.rating = numericRating;
    }
    if (comment !== undefined) review.comment = String(comment || "").trim();

    await review.save();
    await Book.updateRating(review.book);
    await review.populate("user", "name");

    res.json({
      success: true,
      message: "Review updated successfully",
      data: { review: serializeReview(review) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });
    if (String(review.user) !== String(req.user._id) && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "You can only delete your own reviews" });
    }

    const bookId = review.book;
    await review.deleteOne();
    await Book.updateRating(bookId);

    res.json({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

module.exports = router;
