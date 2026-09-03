const {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} = require("crypto");
const mongoose = require("mongoose");
const config = require("../config");
const NewsletterSubscription = require("../models/NewsletterSubscription");
const Post = require("../models/Post");
const Promotion = require("../models/Promotion");
const Voucher = require("../models/Voucher");
const { sendNewsletterContent } = require("./emailService");

const CONFIRMATION_TTL_MS = 24 * 60 * 60_000;
const UNSUBSCRIBE_PURPOSE = "bookshop-newsletter-unsubscribe";
const SEND_CONCURRENCY = 5;

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : "";
}

function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function isOpaqueToken(token) {
  return typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);
}

async function issueNewsletterConfirmation(email, source = "footer") {
  const existing = await NewsletterSubscription.findOne({ email }).select(
    "+confirmationTokenHash +confirmationExpiresAt +consentVersion"
  );
  if (existing?.status === "active") return { alreadyActive: true };
  if (
    existing?.status === "pending" &&
    existing.confirmationTokenHash &&
    existing.confirmationExpiresAt > new Date()
  ) {
    return { alreadyPending: true };
  }

  const token = randomBytes(32).toString("hex");
  const confirmationExpiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS);
  try {
    const subscription = await NewsletterSubscription.findOneAndUpdate(
      { email },
      {
        $set: {
          status: "pending",
          confirmationTokenHash: hashToken(token),
          confirmationExpiresAt,
          confirmedAt: null,
          unsubscribedAt: null,
          source,
        },
        $inc: { consentVersion: 1 },
      },
      { upsert: true, returnDocument: "after", runValidators: true }
    );
    return { subscription, token };
  } catch (error) {
    if (error.code === 11000) return { alreadyPending: true };
    throw error;
  }
}

function unsubscribeSignature(payload) {
  return createHmac("sha256", `${config.jwtSecret}:${UNSUBSCRIBE_PURPOSE}`)
    .update(payload)
    .digest("base64url");
}

function createNewsletterUnsubscribeToken(subscription) {
  const id = String(subscription?._id || subscription?.id || "");
  const version = Number(subscription?.consentVersion || 0);
  if (!mongoose.isValidObjectId(id) || !Number.isInteger(version) || version < 0) {
    throw new Error("Newsletter subscription is invalid");
  }
  const payload = `${id}.${version}`;
  return `${payload}.${unsubscribeSignature(payload)}`;
}

function parseNewsletterUnsubscribeToken(token) {
  const match = String(token || "").match(
    /^([a-f0-9]{24})\.(\d+)\.([A-Za-z0-9_-]{43})$/
  );
  if (!match) return null;
  const payload = `${match[1]}.${match[2]}`;
  const expected = Buffer.from(unsubscribeSignature(payload));
  const received = Buffer.from(match[3]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }
  const version = Number(match[2]);
  return Number.isSafeInteger(version) ? { id: match[1], version } : null;
}

async function unsubscribeNewsletter(token) {
  const parsed = parseNewsletterUnsubscribeToken(token);
  if (!parsed) return null;

  const subscription = await NewsletterSubscription.findById(parsed.id).select(
    "+consentVersion"
  );
  if (!subscription || Number(subscription.consentVersion || 0) !== parsed.version) {
    return null;
  }
  if (subscription.status === "unsubscribed") {
    return { subscription, alreadyUnsubscribed: true };
  }
  if (subscription.status !== "active") return null;

  subscription.status = "unsubscribed";
  subscription.unsubscribedAt = new Date();
  await subscription.save();
  return { subscription, alreadyUnsubscribed: false };
}

function serializeNewsletterPost(post) {
  return {
    id: post._id,
    title: post.title,
    slug: post.slug,
    description: post.shortDescription || "",
    imageUrl: post.thumbnail || "",
    publishedAt: post.publishedAt,
  };
}

function serializeNewsletterPromotion(promotion) {
  return {
    id: promotion._id,
    title: promotion.name,
    description: promotion.description || "",
    type: promotion.type,
    value: promotion.value,
    startDate: promotion.startDate,
    endDate: promotion.endDate,
    status: promotion.getStatus(),
  };
}

function serializeNewsletterVoucher(voucher) {
  return {
    id: voucher._id,
    title: voucher.code,
    code: voucher.code,
    description: voucher.description || "",
    type: voucher.type,
    scope: voucher.scope,
    value: voucher.value,
    minOrder: voucher.minOrder,
    maxDiscount: voucher.maxDiscount,
    endDate: voucher.endAt,
  };
}

async function getNewsletterOverview(now = new Date()) {
  const [activeSubscriberCount, posts, promotions, vouchers] = await Promise.all([
    NewsletterSubscription.countDocuments({ status: "active" }),
    Post.find({ status: "published" })
      .select("title slug shortDescription thumbnail publishedAt")
      .sort({ publishedAt: -1, _id: -1 })
      .limit(100),
    Promotion.find({
      active: true,
      startDate: { $lte: now },
      endDate: { $gt: now },
    })
      .select("name description type value startDate endDate active")
      .sort({ startDate: -1, _id: -1 })
      .limit(100),
    Voucher.find({
      active: true,
      startAt: { $lte: now },
      endAt: { $gt: now },
      $expr: { $lt: ["$usedCount", "$usageLimit"] },
    })
      .select(
        "code description type scope value minOrder maxDiscount startAt endAt"
      )
      .sort({ endAt: 1, _id: -1 })
      .limit(100),
  ]);
  return {
    activeSubscriberCount,
    mailEnabled: config.mail.enabled,
    posts: posts.map(serializeNewsletterPost),
    promotions: promotions.map(serializeNewsletterPromotion),
    vouchers: vouchers.map(serializeNewsletterVoucher),
  };
}

async function resolveNewsletterContent(contentType, contentId, now = new Date()) {
  if (!mongoose.isValidObjectId(contentId)) return null;
  if (contentType === "post") {
    const post = await Post.findOne({ _id: contentId, status: "published" });
    if (!post) return null;
    return {
      contentType,
      title: post.title,
      description: post.shortDescription || "",
      imageUrl: post.thumbnail || "",
      path: `/news/${post.slug}`,
    };
  }
  if (contentType === "promotion") {
    const promotion = await Promotion.findOne({
      _id: contentId,
      active: true,
      startDate: { $lte: now },
      endDate: { $gt: now },
    });
    if (!promotion) return null;
    return {
      contentType,
      title: promotion.name,
      description: promotion.description || "",
      promotionType: promotion.type,
      promotionValue: promotion.value,
      startDate: promotion.startDate,
      endDate: promotion.endDate,
      path: "/products",
    };
  }
  if (contentType === "voucher") {
    const voucher = await Voucher.findOne({
      _id: contentId,
      active: true,
      startAt: { $lte: now },
      endAt: { $gt: now },
      $expr: { $lt: ["$usedCount", "$usageLimit"] },
    });
    if (!voucher) return null;
    return {
      contentType,
      title: `Voucher ${voucher.code}`,
      description: voucher.description || "",
      voucherCode: voucher.code,
      voucherType: voucher.type,
      voucherScope: voucher.scope,
      voucherValue: voucher.value,
      minOrder: voucher.minOrder,
      maxDiscount: voucher.maxDiscount,
      endDate: voucher.endAt,
      path: "/products",
    };
  }
  return null;
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );
  return results;
}

async function sendNewsletterBroadcast({ contentType, contentId }) {
  const content = await resolveNewsletterContent(contentType, contentId);
  if (!content) {
    const error = new Error(
      "Nội dung không tồn tại hoặc chưa đủ điều kiện để gửi newsletter"
    );
    error.statusCode = 422;
    throw error;
  }

  const subscriptions = await NewsletterSubscription.find({ status: "active" })
    .select("email +consentVersion")
    .sort({ _id: 1 })
    .lean();
  const results = await runWithConcurrency(
    subscriptions,
    SEND_CONCURRENCY,
    async (subscription) => {
      try {
        const token = createNewsletterUnsubscribeToken(subscription);
        const unsubscribeUrl = `${config.frontendUrl.replace(/\/$/, "")}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
        const result = await sendNewsletterContent(subscription.email, {
          content,
          unsubscribeUrl,
        });
        return result.delivered ? "delivered" : "preview";
      } catch {
        return "failed";
      }
    }
  );

  return {
    content,
    recipientCount: subscriptions.length,
    deliveredCount: results.filter((result) => result === "delivered").length,
    previewCount: results.filter((result) => result === "preview").length,
    failedCount: results.filter((result) => result === "failed").length,
  };
}

async function clearFailedNewsletterConfirmation(email, token) {
  await NewsletterSubscription.updateOne(
    { email, confirmationTokenHash: hashToken(token), status: "pending" },
    { $unset: { confirmationTokenHash: 1, confirmationExpiresAt: 1 } }
  );
}

async function confirmNewsletterSubscription(token) {
  if (!isOpaqueToken(token)) return null;
  return NewsletterSubscription.findOneAndUpdate(
    {
      confirmationTokenHash: hashToken(token),
      confirmationExpiresAt: { $gt: new Date() },
      status: "pending",
    },
    {
      $set: { status: "active", confirmedAt: new Date() },
      $unset: { confirmationTokenHash: 1, confirmationExpiresAt: 1 },
    },
    { returnDocument: "after" }
  );
}

module.exports = {
  clearFailedNewsletterConfirmation,
  confirmNewsletterSubscription,
  createNewsletterUnsubscribeToken,
  getNewsletterOverview,
  issueNewsletterConfirmation,
  normalizeEmail,
  sendNewsletterBroadcast,
  unsubscribeNewsletter,
};
