const BASE_URL = "https://provinces.open-api.vn/api";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const cache = new Map();

function administrativeError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = "ADMINISTRATIVE_DATA_UNAVAILABLE";
  return error;
}

function safeCode(value) {
  const code = String(value ?? "").trim();
  if (!/^\d{1,6}$/.test(code)) {
    throw administrativeError("Mã đơn vị hành chính không hợp lệ", 400);
  }
  return code;
}

function normalizeUnits(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      code: String(item?.code ?? "").trim(),
      name: String(item?.name ?? "").trim().slice(0, 100),
    }))
    .filter((item) => /^\d{1,6}$/.test(item.code) && item.name);
}

async function fetchJson(path) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: "application/json", "User-Agent": "BookShop/1.0" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw administrativeError(
      error?.name === "TimeoutError"
        ? "Tải dữ liệu địa chỉ quá thời gian"
        : "Không thể kết nối nguồn dữ liệu địa chỉ"
    );
  }
  if (!response.ok) {
    throw administrativeError(`Nguồn dữ liệu địa chỉ trả về HTTP ${response.status}`);
  }
  return response.json();
}

function cached(key, loader) {
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) return existing.promise;
  const promise = loader().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { promise, expiresAt: now + CACHE_TTL_MS });
  return promise;
}

function getProvinces(version = "current") {
  const versionPath = version === "legacy" ? "v1" : "v2";
  return cached(`${versionPath}:provinces`, async () =>
    normalizeUnits(await fetchJson(`/${versionPath}/`))
  );
}

function getDistricts(provinceCode) {
  const code = safeCode(provinceCode);
  return cached(`v1:province:${code}`, async () => {
    const province = await fetchJson(`/v1/p/${encodeURIComponent(code)}?depth=2`);
    return normalizeUnits(province?.districts);
  });
}

function getWards({ version = "current", provinceCode, districtCode }) {
  if (version === "legacy") {
    const code = safeCode(districtCode);
    return cached(`v1:district:${code}`, async () => {
      const district = await fetchJson(`/v1/d/${encodeURIComponent(code)}?depth=2`);
      return normalizeUnits(district?.wards);
    });
  }
  const code = safeCode(provinceCode);
  return cached(`v2:province:${code}`, async () => {
    const province = await fetchJson(`/v2/p/${encodeURIComponent(code)}?depth=2`);
    return normalizeUnits(province?.wards);
  });
}

function clearCache() {
  cache.clear();
}

module.exports = { clearCache, getDistricts, getProvinces, getWards };
