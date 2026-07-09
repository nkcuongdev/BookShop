const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { Readable } = require("stream");
const sharp = require("sharp");
const { v2: cloudinary } = require("cloudinary");
const config = require("../config");

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_DIMENSION = 10_000;

if (config.upload.provider === "cloudinary") {
  cloudinary.config({
    cloud_name: config.upload.cloudinary.cloudName,
    api_key: config.upload.cloudinary.apiKey,
    api_secret: config.upload.cloudinary.apiSecret,
    secure: true,
  });
}

async function normalizeImage(buffer) {
  const source = sharp(buffer, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
    animated: false,
  });
  const metadata = await source.metadata();
  if (!ALLOWED_FORMATS.has(metadata.format)) {
    const error = new Error("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP");
    error.statusCode = 400;
    throw error;
  }
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > MAX_DIMENSION ||
    metadata.height > MAX_DIMENSION
  ) {
    const error = new Error("Kích thước ảnh không hợp lệ hoặc quá lớn");
    error.statusCode = 400;
    throw error;
  }

  const output = await source
    .rotate()
    .resize({ width: 2_000, height: 2_000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: output.data,
    width: output.info.width,
    height: output.info.height,
    size: output.info.size,
  };
}

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: config.upload.cloudinary.folder,
        resource_type: "image",
        format: "webp",
        use_filename: false,
        unique_filename: true,
        overwrite: false,
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    Readable.from(buffer).pipe(stream);
  });
}

async function storeImage(inputBuffer) {
  if (config.upload.provider === "disabled") {
    const error = new Error("Image storage is not configured");
    error.statusCode = 503;
    throw error;
  }

  const normalized = await normalizeImage(inputBuffer);
  if (config.upload.provider === "cloudinary") {
    const result = await uploadToCloudinary(normalized.buffer);
    return {
      url: result.secure_url,
      assetId: result.public_id,
      width: result.width,
      height: result.height,
      size: result.bytes,
      mimeType: "image/webp",
    };
  }

  await fs.mkdir(config.upload.localDir, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(12).toString("hex")}.webp`;
  await fs.writeFile(path.join(config.upload.localDir, filename), normalized.buffer, {
    flag: "wx",
  });
  return {
    url: `${config.apiPublicUrl}/uploads/${filename}`,
    assetId: filename,
    width: normalized.width,
    height: normalized.height,
    size: normalized.size,
    mimeType: "image/webp",
  };
}

async function deleteImage(assetId, provider = config.upload.provider) {
  if (provider === "cloudinary") {
    const result = await cloudinary.uploader.destroy(assetId, {
      resource_type: "image",
      invalidate: true,
    });
    if (!["ok", "not found"].includes(result.result)) {
      throw new Error(`Cloudinary delete failed: ${result.result}`);
    }
    return;
  }

  if (provider !== "local") throw new Error("Unsupported image provider");
  const filename = path.basename(String(assetId || ""));
  if (!filename || filename !== assetId || !/^[a-zA-Z0-9.-]+\.webp$/.test(filename)) {
    throw new Error("Invalid local asset id");
  }
  const target = path.resolve(config.upload.localDir, filename);
  const relative = path.relative(config.upload.localDir, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Asset path is outside the upload directory");
  }
  try {
    await fs.unlink(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function verifyImageStorage() {
  if (config.upload.provider === "disabled") {
    return { enabled: false, healthy: false };
  }
  if (config.upload.provider === "cloudinary") {
    const result = await cloudinary.api.ping();
    return { enabled: true, healthy: result?.status === "ok" };
  }
  await fs.mkdir(config.upload.localDir, { recursive: true });
  await fs.access(config.upload.localDir);
  return { enabled: true, healthy: true };
}

module.exports = { storeImage, deleteImage, verifyImageStorage };
