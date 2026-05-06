require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const config = require("./config");
const routes = require("./routes");
const orderTTL = require("./jobs/orderTTL");

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", routes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "BookShop API Server",
    version: "1.0.0",
    database: "MongoDB",
    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
      books: "/api/books",
      categories: "/api/categories",
      orders: "/api/orders",
      reviews: "/api/reviews",
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`\n🚀 BookShop API Server running on port ${PORT}`);
  console.log(`📚 API: http://localhost:${PORT}/api`);
  console.log(`❤️  Health: http://localhost:${PORT}/api/health\n`);
  orderTTL.start();
});

module.exports = app;
