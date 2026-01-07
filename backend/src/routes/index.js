const express = require("express");
const authRoutes = require("./auth");
const bookRoutes = require("./books");
const orderRoutes = require("./orders");
const reviewRoutes = require("./reviews");
const adminRoutes = require("./admin");
const categoryRoutes = require("./categories");

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

// Mount routes
router.use("/auth", authRoutes);
router.use("/books", bookRoutes);
router.use("/orders", orderRoutes);
router.use("/reviews", reviewRoutes);
router.use("/admin", adminRoutes);
router.use("/categories", categoryRoutes);

module.exports = router;
