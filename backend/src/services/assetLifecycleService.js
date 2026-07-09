const UploadedAsset = require("../models/UploadedAsset");
const config = require("../config");
const { deleteImage } = require("./imageStorage");

const TEMPORARY_TTL_MS = 24 * 60 * 60 * 1000;
const DELETE_LOCK_MS = 2 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;

async function registerUploadedAsset(image, ownerId, purpose = "book") {
  return UploadedAsset.create({
    assetId: image.assetId,
    url: image.url,
    provider: config.upload.provider,
    owner: ownerId,
    purpose,
    status: "temporary",
    expiresAt: new Date(Date.now() + TEMPORARY_TTL_MS),
  });
}

function normalizeReviewImageUrls(urls) {
  if (!Array.isArray(urls)) {
    const error = new Error("Danh sách ảnh đánh giá không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  const normalized = urls.map((url) => String(url || "").trim()).filter(Boolean);
  if (
    normalized.length > 3 ||
    new Set(normalized).size !== normalized.length ||
    normalized.some((url) => url.length > 2048)
  ) {
    const error = new Error("Đánh giá chỉ được đính kèm tối đa 3 ảnh khác nhau");
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function normalizeReturnImageUrls(urls) {
  if (!Array.isArray(urls)) {
    const error = new Error("Danh sách ảnh bằng chứng không hợp lệ");
    error.statusCode = 400;
    throw error;
  }
  const normalized = urls.map((url) => String(url || "").trim()).filter(Boolean);
  if (
    normalized.length > 3 ||
    new Set(normalized).size !== normalized.length ||
    normalized.some((url) => url.length > 2048)
  ) {
    const error = new Error("Yêu cầu đổi trả chỉ được đính kèm tối đa 3 ảnh khác nhau");
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

async function claimReviewAssets(reviewId, ownerId, urls, session) {
  const normalizedUrls = normalizeReviewImageUrls(urls);
  if (!normalizedUrls.length) return normalizedUrls;

  const assetFilter = {
    url: { $in: normalizedUrls },
    owner: ownerId,
    purpose: "review",
    status: { $in: ["temporary", "attached"] },
    $or: [{ entityId: null }, { entityType: "review", entityId: reviewId }],
  };
  const candidateQuery = UploadedAsset.find(assetFilter).select("url entityId").lean();
  if (session) candidateQuery.session(session);
  const candidates = await candidateQuery;
  if (candidates.length !== normalizedUrls.length) {
    const error = new Error("Có ảnh không hợp lệ, đã hết hạn hoặc không thuộc tài khoản của bạn");
    error.statusCode = 400;
    throw error;
  }
  const newlyClaimedUrls = candidates
    .filter((asset) => !asset.entityId)
    .map((asset) => asset.url);

  const result = await UploadedAsset.updateMany(
    assetFilter,
    {
      $set: {
        status: "attached",
        entityType: "review",
        entityId: reviewId,
        expiresAt: new Date("9999-12-31T23:59:59.999Z"),
        nextRetryAt: null,
        lockedUntil: null,
        retryCount: 0,
        lastError: "",
      },
    },
    session ? { session } : {}
  );

  if (result.matchedCount !== normalizedUrls.length) {
    if (newlyClaimedUrls.length) {
      await releaseReviewAssetClaims(reviewId, newlyClaimedUrls).catch(() => {});
    }
    const error = new Error("Có ảnh không hợp lệ, đã hết hạn hoặc không thuộc tài khoản của bạn");
    error.statusCode = 400;
    throw error;
  }
  return normalizedUrls;
}

async function queueRemovedReviewAssets(reviewId, retainedUrls = [], session) {
  const normalizedUrls = normalizeReviewImageUrls(retainedUrls);
  return UploadedAsset.updateMany(
    {
      entityType: "review",
      entityId: reviewId,
      ...(normalizedUrls.length ? { url: { $nin: normalizedUrls } } : {}),
    },
    {
      $set: {
        status: "pending_delete",
        expiresAt: new Date(),
        nextRetryAt: new Date(),
        lockedUntil: null,
      },
    },
    session ? { session } : {}
  );
}

async function releaseReviewAssetClaims(reviewId, urls) {
  const normalizedUrls = normalizeReviewImageUrls(urls);
  if (!normalizedUrls.length) return;
  await UploadedAsset.updateMany(
    {
      entityType: "review",
      entityId: reviewId,
      url: { $in: normalizedUrls },
      status: "attached",
    },
    {
      $set: {
        status: "temporary",
        entityType: null,
        entityId: null,
        expiresAt: new Date(Date.now() + TEMPORARY_TTL_MS),
        nextRetryAt: null,
        lockedUntil: null,
      },
    }
  );
}

async function claimReturnRequestAssets(returnRequestId, ownerId, urls) {
  const normalizedUrls = normalizeReturnImageUrls(urls);
  if (!normalizedUrls.length) return normalizedUrls;

  const assetFilter = {
    url: { $in: normalizedUrls },
    owner: ownerId,
    purpose: "return_request",
    status: { $in: ["temporary", "attached"] },
    $or: [
      { entityId: null },
      { entityType: "return_request", entityId: returnRequestId },
    ],
  };
  const candidates = await UploadedAsset.find(assetFilter)
    .select("url entityId")
    .lean();
  if (candidates.length !== normalizedUrls.length) {
    const error = new Error(
      "Có ảnh không hợp lệ, đã hết hạn hoặc không thuộc tài khoản của bạn"
    );
    error.statusCode = 400;
    throw error;
  }

  const newlyClaimedUrls = candidates
    .filter((asset) => !asset.entityId)
    .map((asset) => asset.url);
  const result = await UploadedAsset.updateMany(assetFilter, {
    $set: {
      status: "attached",
      entityType: "return_request",
      entityId: returnRequestId,
      expiresAt: new Date("9999-12-31T23:59:59.999Z"),
      nextRetryAt: null,
      lockedUntil: null,
      retryCount: 0,
      lastError: "",
    },
  });

  if (result.matchedCount !== normalizedUrls.length) {
    if (newlyClaimedUrls.length) {
      await releaseReturnRequestAssetClaims(
        returnRequestId,
        newlyClaimedUrls
      ).catch(() => {});
    }
    const error = new Error(
      "Có ảnh không hợp lệ, đã hết hạn hoặc không thuộc tài khoản của bạn"
    );
    error.statusCode = 400;
    throw error;
  }
  return normalizedUrls;
}

async function releaseReturnRequestAssetClaims(returnRequestId, urls) {
  const normalizedUrls = normalizeReturnImageUrls(urls);
  if (!normalizedUrls.length) return;
  await UploadedAsset.updateMany(
    {
      entityType: "return_request",
      entityId: returnRequestId,
      url: { $in: normalizedUrls },
      status: "attached",
    },
    {
      $set: {
        status: "temporary",
        entityType: null,
        entityId: null,
        expiresAt: new Date(Date.now() + TEMPORARY_TTL_MS),
        nextRetryAt: null,
        lockedUntil: null,
      },
    }
  );
}

async function syncManagedAssets({
  entityType,
  purpose,
  entityLabel,
  entityId,
  ownerId,
  urls,
  session,
  retainedLegacyUrls = [],
}) {
  const normalizedUrls = [...new Set((urls || []).filter(Boolean))];
  const legacyUrls = new Set((retainedLegacyUrls || []).filter(Boolean));
  const queryOptions = session ? { session } : {};

  if (normalizedUrls.length) {
    const managedQuery = UploadedAsset.find({
      url: { $in: normalizedUrls },
      purpose,
      status: { $in: ["temporary", "attached"] },
      $or: [
        { owner: ownerId, entityId: null },
        { entityType, entityId },
      ],
    })
      .select("url")
      .lean();
    if (session) managedQuery.session(session);
    const managedUrls = new Set(
      (await managedQuery).map((asset) => asset.url)
    );
    const unmanagedUrls = normalizedUrls.filter(
      (url) => !managedUrls.has(url) && !legacyUrls.has(url)
    );
    if (unmanagedUrls.length) {
      const error = new Error(
        `Ảnh ${entityLabel} phải được tải lên kho ảnh BookShop trước khi lưu`
      );
      error.statusCode = 400;
      error.code = `${purpose.toUpperCase()}_IMAGE_NOT_MANAGED`;
      throw error;
    }
  }

  await UploadedAsset.updateMany(
    {
      entityType,
      entityId,
      status: "attached",
      url: { $nin: normalizedUrls },
    },
    {
      $set: {
        status: "pending_delete",
        expiresAt: new Date(),
        nextRetryAt: new Date(),
        lockedUntil: null,
      },
    },
    queryOptions
  );

  if (!normalizedUrls.length) return;
  await UploadedAsset.updateMany(
    {
      url: { $in: normalizedUrls },
      purpose,
      status: { $in: ["temporary", "attached"] },
      $or: [
        { owner: ownerId, entityId: null },
        { entityType, entityId },
      ],
    },
    {
      $set: {
        status: "attached",
        entityType,
        entityId,
        expiresAt: new Date("9999-12-31T23:59:59.999Z"),
        nextRetryAt: null,
        lockedUntil: null,
        retryCount: 0,
        lastError: "",
      },
    },
    queryOptions
  );
}

async function syncBookAssets(
  bookId,
  ownerId,
  urls,
  session,
  retainedLegacyUrls = []
) {
  return syncManagedAssets({
    entityType: "book",
    purpose: "book",
    entityLabel: "sách",
    entityId: bookId,
    ownerId,
    urls,
    session,
    retainedLegacyUrls,
  });
}

async function queueManagedAssetsForDeletion(entityType, entityId, session) {
  return UploadedAsset.updateMany(
    { entityType, entityId },
    {
      $set: {
        status: "pending_delete",
        expiresAt: new Date(),
        nextRetryAt: new Date(),
        lockedUntil: null,
      },
    },
    session ? { session } : {}
  );
}

async function queueBookAssetsForDeletion(bookId, session) {
  return queueManagedAssetsForDeletion("book", bookId, session);
}

async function claimDueAsset(now = new Date()) {
  const lockUntil = new Date(now.getTime() + DELETE_LOCK_MS);
  return UploadedAsset.findOneAndUpdate(
    {
      $or: [
        { status: "temporary", expiresAt: { $lte: now } },
        { status: "pending_delete", nextRetryAt: { $lte: now } },
        { status: "deleting", lockedUntil: { $lte: now } },
      ],
    },
    { $set: { status: "deleting", lockedUntil: lockUntil } },
    { returnDocument: "after", sort: { nextRetryAt: 1, expiresAt: 1, _id: 1 } }
  );
}

async function cleanupOneDueAsset(now = new Date()) {
  const asset = await claimDueAsset(now);
  if (!asset) return false;

  try {
    await deleteImage(asset.assetId, asset.provider);
    await UploadedAsset.deleteOne({ _id: asset._id, status: "deleting" });
  } catch (error) {
    const retryCount = asset.retryCount + 1;
    const delay = Math.min(60_000 * 2 ** Math.min(retryCount, 10), MAX_RETRY_DELAY_MS);
    await UploadedAsset.updateOne(
      { _id: asset._id, status: "deleting" },
      {
        $set: {
          status: "pending_delete",
          nextRetryAt: new Date(Date.now() + delay),
          lockedUntil: null,
          lastError: String(error.message || error).slice(0, 500),
        },
        $inc: { retryCount: 1 },
      }
    );
  }
  return true;
}

module.exports = {
  claimReturnRequestAssets,
  claimReviewAssets,
  normalizeReturnImageUrls,
  registerUploadedAsset,
  releaseReturnRequestAssetClaims,
  releaseReviewAssetClaims,
  queueRemovedReviewAssets,
  queueManagedAssetsForDeletion,
  syncManagedAssets,
  syncBookAssets,
  queueBookAssetsForDeletion,
  cleanupOneDueAsset,
};
