const express = require("express");
const authRoutes = require("./auth");
const bookRoutes = require("./books");
const orderRoutes = require("./orders");
const adminRoutes = require("./admin");
const categoryRoutes = require("./categories");
const voucherRoutes = require("./vouchers");
const promotionRoutes = require("./promotions");
const { adminChatRouter, customerChatRouter } = require("./chat");
const userRoutes = require("./users");
const roleRoutes = require("./roles");
const analyticsRoutes = require("./analytics");
const postRoutes = require("./posts");
const cartRoutes = require("./cart");
const voucherPublicRoutes = require("./voucherPublic");
const loyaltyRoutes = require("./loyalty");
const loyaltyAdminRoutes = require("./loyaltyAdmin");
const notificationRoutes = require("./notifications");
const eventRoutes = require("./events");
const { adminUploadRouter, reviewUploadRouter } = require("./uploads");
const accountRecoveryRoutes = require("./accountRecovery");
const newsletterRoutes = require("./newsletter");
const adminNewsletterRoutes = require("./adminNewsletter");
const shippingRoutes = require("./shipping");
const administrativeRoutes = require("./administrative");
const supplierRoutes = require("./suppliers");
const inventoryRoutes = require("./inventory");
const reportRoutes = require("./reports");
const auditLogRoutes = require("./auditLogs");
const stockReceiptRoutes = require("./stockReceipts");
const stockIssueRoutes = require("./stockIssues");
const stockCountRoutes = require("./stockCounts");
const {
  customerSupportTicketRouter,
  adminSupportTicketRouter,
} = require("./supportTickets");
const { checkReadiness } = require("../services/readinessService");

const router = express.Router();

router.get("/health/live", (_req, res) => {
  res.json({
    success: true,
    status: "alive",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

async function readinessHandler(_req, res, next) {
  try {
    const readiness = await checkReadiness();
    res.locals.operationalHealthResponse = true;
    return res.status(readiness.ready ? 200 : 503).json({
      success: readiness.ready,
      status: readiness.ready ? "ready" : "not_ready",
      ...readiness,
      version: "1.0.0",
    });
  } catch (error) {
    return next(error);
  }
}

router.get("/health", readinessHandler);
router.get("/health/ready", readinessHandler);

// Public / customer routes
router.use("/auth", authRoutes);
router.use("/auth", accountRecoveryRoutes);
router.use("/books", bookRoutes);
router.use("/orders", orderRoutes);
router.use("/categories", categoryRoutes);
router.use("/cart", cartRoutes);
router.use("/vouchers", voucherPublicRoutes);
router.use("/loyalty", loyaltyRoutes);
router.use("/notifications", notificationRoutes);
router.use("/events", eventRoutes);
router.use("/newsletter", newsletterRoutes);
router.use("/shipping", shippingRoutes);
router.use("/administrative", administrativeRoutes);
router.use("/support-tickets", customerSupportTicketRouter);
router.use("/uploads", reviewUploadRouter);

// Roles must be mounted before "/admin": admin.js applies staffOnly to every
// path under that prefix, which would refuse a customer reading their own
// permissions at /admin/roles/me.
router.use("/admin/roles", roleRoutes);

// Admin-only routes (all nested under /admin/*)
router.use("/admin", adminRoutes);
router.use("/admin/vouchers", voucherRoutes);
router.use("/admin/promotions", promotionRoutes);
router.use("/admin/loyalty", loyaltyAdminRoutes);
// Chat: /api/chat/* for customers, /api/admin/chat/* for staff. Separate
// routers so customer endpoints are not reachable under the admin prefix.
router.use("/chat", customerChatRouter);
router.use("/admin/chat", adminChatRouter);
router.use("/admin/users", userRoutes);
router.use("/admin/analytics", analyticsRoutes);
router.use("/admin/uploads", adminUploadRouter);
router.use("/admin/newsletter", adminNewsletterRoutes);
router.use("/admin/support-tickets", adminSupportTicketRouter);
router.use("/admin/audit-logs", auditLogRoutes);

// Inventory / warehouse management
router.use("/admin/suppliers", supplierRoutes);
router.use("/admin/inventory", inventoryRoutes);
router.use("/admin/reports", reportRoutes);
router.use("/admin/stock-receipts", stockReceiptRoutes);
router.use("/admin/stock-issues", stockIssueRoutes);
router.use("/admin/stock-counts", stockCountRoutes);

// Posts / Blog routes (public + admin nested under /posts/admin/*)
router.use("/posts", postRoutes);

module.exports = router;
