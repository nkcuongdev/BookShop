require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const config = require("./config");
const roleRegistry = require("./services/roleRegistry");
const routes = require("./routes");
const orderTTL = require("./jobs/orderTTL");
const { seedRoles } = require("./jobs/seedRoles");
const assetCleanup = require("./jobs/assetCleanup");
const shippingSimulation = require("./jobs/shippingSimulation");
const promotionAlerts = require("./jobs/promotionAlerts");
const orderCancellation = require("./jobs/orderCancellation");
const returnRefund = require("./jobs/returnRefund");
const supportTicketSweep = require("./jobs/supportTicketSweep");
const lowStockAlerts = require("./jobs/lowStockAlerts");
const reconcileStock = require("./jobs/reconcileStock");
const cartReminders = require("./jobs/cartReminders");
const loyaltyTier = require("./jobs/loyaltyTier");
const Book = require("./models/Book");
const Review = require("./models/Review");
const ReviewReport = require("./models/ReviewReport");
const OrderOutboxEvent = require("./models/OrderOutboxEvent");
const NewsletterSubscription = require("./models/NewsletterSubscription");
const VoucherRedemption = require("./models/VoucherRedemption");
const ReturnRequest = require("./models/ReturnRequest");
const SupportTicket = require("./models/SupportTicket");
const PromotionAlertDelivery = require("./models/PromotionAlertDelivery");
const User = require("./models/User");
const LoyaltyLedger = require("./models/LoyaltyLedger");
const LoyaltyProgram = require("./models/LoyaltyProgram");
const LoyaltyGift = require("./models/LoyaltyGift");
const LoyaltyGiftRedemption = require("./models/LoyaltyGiftRedemption");
const LoyaltyDebtEvent = require("./models/LoyaltyDebtEvent");
const Author = require("./models/Author");
const Publisher = require("./models/Publisher");
const { backfillBookMetadata } = require("./services/bookMetadataService");
const Order = require("./models/Order");
const Conversation = require("./models/Conversation");
const { setSocketServer } = require("./services/authService");
const {
  createSocketAuthMiddleware,
  enforceSocketAuthorization,
} = require("./services/socketAuthService");
const {
  errorHandler,
  notFound,
  requestContext,
  sanitizeErrorResponses,
} = require("./middleware/errorHandler");
const { checkReadiness } = require("./services/readinessService");
const { cspImageSources } = require("./utils/imageUrlPolicy");

const app = express();
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
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
setSocketServer(io);

io.use(createSocketAuthMiddleware());

io.on("connection", async (socket) => {
  enforceSocketAuthorization(socket);
  socket.join(`user:${socket.user._id}`);
  socket.join(`session:${socket.auth.sid}`);
  // Staff join their own role room; admins additionally join every staff room
  // so role-targeted broadcasts still reach them. Awaited before any emit can
  // be missed, and guarded so a registry failure cannot drop the connection.
  try {
    if (socket.user.role === "admin") {
      const staff = await roleRegistry.staffRoles();
      staff.forEach((role) => socket.join(`role:${role}`));
    } else if (await roleRegistry.isStaffRole(socket.user.role)) {
      socket.join(`role:${socket.user.role}`);
    } else {
      socket.join("role:user");
    }
  } catch {
    socket.join("role:user");
  }

  socket.on("chat:join", async (conversationId) => {
    try {
      if (!conversationId) return;
      const conversation = await Conversation.findById(conversationId).select("user");
      if (!conversation) return;

      const isAgent = await roleRegistry.roleHasPermission(
        socket.user.role,
        "chat.read"
      );
      const isOwner = String(conversation.user || "") === String(socket.user._id);
      if (isAgent || isOwner) {
        socket.join(`conversation:${conversationId}`);
      }
    } catch {
      // Ignore malformed ids and stale conversations.
    }
  });
});

app.use(requestContext);
app.use(sanitizeErrorResponses);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        frameSrc: ["'none'"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          ...cspImageSources(),
        ],
        manifestSrc: ["'self'"],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
        ],
        workerSrc: ["'self'", "blob:"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
  })
);
app.use(cors(corsOptions));
app.use(
  express.json({
    limit: "1mb",
    verify(req, _res, buffer) {
      req.rawBody = buffer.toString("utf8");
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(
  "/uploads",
  express.static(config.upload.localDir, {
    dotfiles: "deny",
    fallthrough: true,
    immutable: true,
    maxAge: "1y",
    index: false,
  })
);

app.use(
  "/api",
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        connectSrc: ["'none'"],
        fontSrc: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        frameSrc: ["'none'"],
        imgSrc: ["'none'"],
        manifestSrc: ["'none'"],
        mediaSrc: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'none'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'none'"],
        workerSrc: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
  }),
  routes
);

if (process.env.NODE_ENV === "production") {
  const frontendDist = path.resolve(__dirname, "../../frontend/dist");
  app.use(
    "/assets",
    express.static(path.join(frontendDist, "assets"), {
      dotfiles: "deny",
      immutable: true,
      index: false,
      maxAge: "1y",
    })
  );
  app.use(
    express.static(frontendDist, {
      dotfiles: "deny",
      index: false,
      maxAge: "1h",
    })
  );
  app.get("*", (req, res, next) => {
    if (
      req.path === "/api" ||
      req.path.startsWith("/api/") ||
      req.path === "/uploads" ||
      req.path.startsWith("/uploads/") ||
      !req.accepts("html")
    ) {
      return next();
    }
    res.set("Cache-Control", "no-store");
    return res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
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
        reviews: "/api/books/:bookId/reviews",
      },
    });
  });
}

app.use(notFound);
app.use(errorHandler);

async function start() {
  await connectDB();
  // Roles gate every admin request, so they must exist before the server
  // accepts traffic. Production authorization fails closed until this finishes.
  await seedRoles();
  await Promise.all([
    Review.ensureReviewIndexes(),
    ReviewReport.syncIndexes(),
    OrderOutboxEvent.syncIndexes(),
    NewsletterSubscription.syncIndexes(),
    VoucherRedemption.syncIndexes(),
    ReturnRequest.syncIndexes(),
    PromotionAlertDelivery.syncIndexes(),
    SupportTicket.syncIndexes(),
    LoyaltyLedger.syncIndexes(),
    LoyaltyProgram.syncIndexes(),
    LoyaltyGift.syncIndexes(),
    LoyaltyGiftRedemption.syncIndexes(),
    LoyaltyDebtEvent.syncIndexes(),
    Author.syncIndexes(),
    Publisher.syncIndexes(),
  ]);
  // Order and User gain loyalty indexes; createIndexes rather than syncIndexes
  // because syncIndexes drops anything not declared in the schema, which would
  // take hand-created indexes with it.
  await Promise.all([Order.createIndexes(), User.createIndexes()]);
  await backfillBookMetadata();
  await Book.createIndexes();
  await Book.migrateRatingAggregates();
  await Order.migrateItemCategorySnapshots();
  // Category consolidation must land before the rank backfill, since it can
  // change a ticket's category and fault party.
  await SupportTicket.migrateCategories();
  await SupportTicket.migrateQueueRanks();
  const readiness = await checkReadiness({ bypassCache: true });
  if (!readiness.ready) {
    const failed = Object.entries(readiness.checks)
      .filter(([, status]) => status === "down")
      .map(([name]) => name)
      .join(", ");
    throw new Error(`Startup dependencies are not ready: ${failed}`);
  }
  const PORT = config.port;
  server.listen(PORT, () => {
    console.log(`\nBookShop API Server running on port ${PORT}`);
    console.log(`API: http://localhost:${PORT}/api`);
    console.log(`Health: http://localhost:${PORT}/api/health\n`);
    orderTTL.start();
    assetCleanup.start();
    shippingSimulation.start();
    promotionAlerts.start(app);
    orderCancellation.start();
    returnRefund.start();
    supportTicketSweep.start();
    lowStockAlerts.start(app);
    reconcileStock.start(app);
    cartReminders.start(app);
    loyaltyTier.start();
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}

module.exports = app;
