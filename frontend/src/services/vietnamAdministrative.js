import { request } from "./api/client";

const REQUEST_TIMEOUT_MS = 8_000;
const responseCache = new Map();

function apiVersion(version) {
  return version === "legacy" ? "v1" : "v2";
}

function safeCode(code) {
  const value = String(code ?? "").trim();
  if (!/^\d{1,6}$/.test(value)) {
    throw new Error("Mã đơn vị hành chính không hợp lệ");
  }
  return value;
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
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await request(
      `/administrative${path}`,
      { signal: controller.signal },
      { allowRefresh: false, redirectOnUnauthorized: false, logErrors: false }
    );
    return response.data?.units || [];
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Tải dữ liệu địa chỉ quá thời gian", { cause: error });
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function cached(key, loader) {
  if (responseCache.has(key)) return responseCache.get(key);
  const promise = loader().catch((error) => {
    responseCache.delete(key);
    throw error;
  });
  responseCache.set(key, promise);
  return promise;
}

export const vietnamAdministrativeAPI = {
  getProvinces(version = "current") {
    const versionPath = apiVersion(version);
    return cached(`${versionPath}:provinces`, async () =>
      normalizeUnits(await fetchJson(`/provinces?version=${versionPath === "v1" ? "legacy" : "current"}`))
    );
  },

  getDistricts(provinceCode) {
    const code = safeCode(provinceCode);
    return cached(`v1:province:${code}`, async () => {
      return normalizeUnits(
        await fetchJson(`/districts?provinceCode=${encodeURIComponent(code)}`)
      );
    });
  },

  getWards({ version = "current", provinceCode, districtCode }) {
    if (version === "legacy") {
      const code = safeCode(districtCode);
      return cached(`v1:district:${code}`, async () => {
        return normalizeUnits(
          await fetchJson(
            `/wards?version=legacy&districtCode=${encodeURIComponent(code)}`
          )
        );
      });
    }

    const code = safeCode(provinceCode);
    return cached(`v2:province:${code}`, async () => {
      return normalizeUnits(
        await fetchJson(
          `/wards?version=current&provinceCode=${encodeURIComponent(code)}`
        )
      );
    });
  },
};

export function clearVietnamAdministrativeCache() {
  responseCache.clear();
}
