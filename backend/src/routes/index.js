const express = require("express");
const authRoutes = require("./auth");
const bookRoutes = require("./books");
const orderRoutes = require("./orders");
const reviewRoutes = require("./reviews");
const adminRoutes = require("./admin");
const categoryRoutes = require("./categories");
const voucherRoutes = require("./vouchers");
const promotionRoutes = require("./promotions");
const chatRoutes = require("./chat");
const userRoutes = require("./users");
const analyticsRoutes = require("./analytics");
const postRoutes = require("./posts");

const router = express.Router();

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    database: "MongoDB",
  });
});

// Public / customer routes
router.use("/auth", authRoutes);
router.use("/books", bookRoutes);
router.use("/orders", orderRoutes);
router.use("/reviews", reviewRoutes);
router.use("/categories", categoryRoutes);

// Admin-only routes (all nested under /admin/*)
router.use("/admin", adminRoutes);
router.use("/admin/vouchers", voucherRoutes);
router.use("/admin/promotions", promotionRoutes);
// Chat: /api/chat/* for customers, /api/admin/chat/* for admins (same router)
router.use("/chat", chatRoutes);
router.use("/admin/chat", chatRoutes);
router.use("/admin/users", userRoutes);
router.use("/admin/analytics", analyticsRoutes);

// Posts / Blog routes (public + admin nested under /posts/admin/*)
router.use("/posts", postRoutes);

module.exports = router;
