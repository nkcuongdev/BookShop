const express = require("express");
const Review = require("../models/Review");
const Order = require("../models/Order");
const { auth } = require("../middleware/auth");

const router = express.Router();

// Get reviews for a book (public)
router.get("/book/:bookId", (req, res) => {
  try {
    const reviews = Review.findByBookId(req.params.bookId);

    res.json({
      success: true,
      data: {
        reviews,
        averageRating: Review.getAverageRating(req.params.bookId),
        count: reviews.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// Check if user can review a book
router.get("/can-review/:bookId", auth, (req, res) => {
  try {
    const hasPurchased = Order.hasUserPurchasedBook(
      req.user.id,
      req.params.bookId
    );
    const hasReviewed = Review.hasUserReviewed(req.user.id, req.params.bookId);

    res.json({
      success: true,
      data: {
        canReview: hasPurchased && !hasReviewed,
        hasPurchased,
        hasReviewed,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// Create review
router.post("/", auth, (req, res) => {
  try {
    const { bookId, rating, comment } = req.body;

    // Validation
    if (!bookId || !rating) {
      return res.status(400).json({
        success: false,
        message: "Book ID and rating are required",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Check if user has purchased the book
    if (!Order.hasUserPurchasedBook(req.user.id, bookId)) {
      return res.status(403).json({
        success: false,
        message: "You can only review books you have purchased",
      });
    }

    // Check if user has already reviewed
    if (Review.hasUserReviewed(req.user.id, bookId)) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this book",
      });
    }

    const review = Review.create({
      bookId,
      userId: req.user.id,
      userName: req.user.name,
      rating,
      comment,
    });

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      data: { review },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// Update review
router.put("/:id", auth, (req, res) => {
  try {
    const review = Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    // Check if user owns the review
    if (review.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own reviews",
      });
    }

    const { rating, comment } = req.body;
    const updatedReview = Review.update(req.params.id, { rating, comment });

    res.json({
      success: true,
      message: "Review updated successfully",
      data: { review: updatedReview },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// Delete review
router.delete("/:id", auth, (req, res) => {
  try {
    const review = Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    // Check if user owns the review or is admin
    if (review.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own reviews",
      });
    }

    Review.delete(req.params.id);

    res.json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

module.exports = router;
