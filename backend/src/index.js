require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const connectDB = require("./config/db");
const config = require("./config");
const routes = require("./routes");
const orderTTL = require("./jobs/orderTTL");
const User = require("./models/User");
const Review = require("./models/Review");
const Conversation = require("./models/Conversation");
const { getCookieValue } = require("./middleware/auth");

const app = express();
const server = http.createServer(app);

function parseOrigins(...values) {
  return values
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

const allowedOrigins = new Set(parseOrigins(config.frontendUrl, process.env.FRONTEND_URL));

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, "");
    if (
      allowedOrigins.has(normalized) ||
      (process.env.NODE_ENV !== "production" &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized))
    ) {
      return callback(null, true);
    }
    return callback(new Error("CORS origin not allowed"));
  },
  credentials: true,
};

const io = new Server(server, { cors: corsOptions });
app.set("io", io);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || getCookieValue(socket, "bookshop_token");
    if (!token) return next(new Error("Authentication required"));

    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.id || decoded.userId);
    if (!user || user.status === "banned") {
      return next(new Error("Authentication failed"));
    }

    socket.user = user;
    return next();
  } catch {
    return next(new Error("Authentication failed"));
  }
});

io.on("connection", (socket) => {
  socket.join(`user:${socket.user._id}`);
  socket.join(`role:${socket.user.role === "admin" ? "admin" : "user"}`);

  socket.on("chat:join", async (conversationId) => {
    try {
      if (!conversationId) return;
      const conversation = await Conversation.findById(conversationId).select("user");
      if (!conversation) return;

      const isAdmin = socket.user.role === "admin";
      const isOwner = String(conversation.user || "") === String(socket.user._id);
      if (isAdmin || isOwner) {
        socket.join(`conversation:${conversationId}`);
      }
    } catch {
      // Ignore malformed ids and stale conversations.
    }
  });
});

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api", routes);

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

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});

app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

async function start() {
  await connectDB();
  await Review.ensureReviewIndexes();
  const PORT = config.port;
  server.listen(PORT, () => {
    console.log(`\nBookShop API Server running on port ${PORT}`);
    console.log(`API: http://localhost:${PORT}/api`);
    console.log(`Health: http://localhost:${PORT}/api/health\n`);
    orderTTL.start();
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

module.exports = app;
