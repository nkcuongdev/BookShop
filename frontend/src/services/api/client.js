const apiHost = import.meta.env.VITE_API_HOST;

export const API_BASE = apiHost
  ? `https://${String(apiHost).replace(/^https?:\/\//, "").replace(/\/$/, "")}/api`
  : import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.PROD ? "/api" : "http://localhost:5000/api");

let refreshPromise = null;

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ApiError";
    this.status = Number(options.status) || 0;
    this.code = options.code || "REQUEST_FAILED";
    this.field = options.field || null;
    this.requestId = options.requestId || null;
    this.details = options.details ?? null;
  }

  static fromResponse(response, data = {}, fallbackMessage = "Request failed") {
    return new ApiError(data.message || fallbackMessage, {
      status: response?.status,
      code: data.code,
      field: data.field,
      requestId: data.requestId || response?.headers?.get?.("x-request-id"),
      details: data.details || data.errors || null,
    });
  }
}

function getCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const part = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : "";
}

export function clearStoredSession() {
  localStorage.removeItem("bookshop_token");
  localStorage.removeItem("bookshop_csrf");
  localStorage.removeItem("bookshop_user");
  window.dispatchEvent(new Event("bookshop:session-expired"));
}

function redirectToLogin() {
  const currentPath = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname === "/login") return;
  window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
}

function isUnsafeMethod(method = "GET") {
  return !["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase());
}

function getCsrfToken() {
  return localStorage.getItem("bookshop_csrf") || getCookie("bookshop_csrf");
}

function buildFetchConfig(options = {}) {
  const { headers: optionHeaders = {}, ...requestOptions } = options;
  const method = requestOptions.method || "GET";
  const csrf = isUnsafeMethod(method) ? getCsrfToken() : "";
  const isFormData =
    typeof FormData !== "undefined" && requestOptions.body instanceof FormData;
  const hasContentType = Object.keys(optionHeaders).some(
    (name) => name.toLowerCase() === "content-type"
  );
  const shouldSetJsonContentType =
    !isFormData &&
    typeof requestOptions.body === "string" &&
    requestOptions.body.length > 0 &&
    !hasContentType;
  return {
    ...requestOptions,
    headers: {
      ...(shouldSetJsonContentType
        ? { "Content-Type": "application/json" }
        : {}),
      ...(isUnsafeMethod(method) && csrf ? { "X-CSRF-Token": csrf } : {}),
      ...optionHeaders,
    },
    credentials: "include",
  };
}

async function parseResponse(response) {
  return response.json().catch(() => ({}));
}

export async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      let csrf = getCsrfToken();
      if (!csrf) {
        const bootstrapResponse = await fetch(`${API_BASE}/auth/csrf`, {
          credentials: "include",
        });
        const bootstrapData = await parseResponse(bootstrapResponse);
        if (!bootstrapResponse.ok || !bootstrapData.data?.csrfToken) {
          throw new Error(
            bootstrapData.message || "No refresh session"
          );
        }
        csrf = bootstrapData.data.csrfToken;
        localStorage.setItem("bookshop_csrf", csrf);
      }
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        credentials: "include",
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.message || "Refresh session expired");
      }
      if (data.data?.user) {
        localStorage.setItem("bookshop_user", JSON.stringify(data.data.user));
      }
      if (data.data?.csrfToken) {
        localStorage.setItem("bookshop_csrf", data.data.csrfToken);
      }
      return data;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function request(endpoint, options = {}, requestPolicy = {}) {
  const {
    allowRefresh = true,
    redirectOnUnauthorized = true,
    logErrors = true,
  } = requestPolicy;
  const isAuthEntry = ["/auth/login", "/auth/register", "/auth/refresh"].includes(
    endpoint
  );

  try {
    let response = await fetch(
      `${API_BASE}${endpoint}`,
      buildFetchConfig(options)
    );
    if (response.status === 401 && allowRefresh && !isAuthEntry) {
      try {
        await refreshSession();
        response = await fetch(
          `${API_BASE}${endpoint}`,
          buildFetchConfig(options)
        );
      } catch {
        clearStoredSession();
        if (redirectOnUnauthorized) redirectToLogin();
      }
    }

    const data = await parseResponse(response);
    if (!response.ok) {
      if (response.status === 401 && !isAuthEntry) {
        clearStoredSession();
        if (redirectOnUnauthorized) redirectToLogin();
      }
      throw ApiError.fromResponse(response, data);
    }
    return data;
  } catch (error) {
    if (logErrors) console.error("API Error:", error);
    throw error;
  }
}

function downloadFilename(contentDisposition = "") {
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return contentDisposition.match(/filename="?([^";]+)"?/i)?.[1] || "download";
}

export async function downloadFile(endpoint, options = {}, requestPolicy = {}) {
  const {
    allowRefresh = true,
    redirectOnUnauthorized = true,
    logErrors = true,
  } = requestPolicy;
  try {
    let response = await fetch(
      `${API_BASE}${endpoint}`,
      buildFetchConfig({ method: "GET", ...options })
    );
    if (response.status === 401 && allowRefresh) {
      try {
        await refreshSession();
        response = await fetch(
          `${API_BASE}${endpoint}`,
          buildFetchConfig({ method: "GET", ...options })
        );
      } catch {
        clearStoredSession();
        if (redirectOnUnauthorized) redirectToLogin();
      }
    }
    if (!response.ok) {
      const data = await parseResponse(response);
      throw ApiError.fromResponse(response, data, "Không thể tải file");
    }
    const disposition = response.headers?.get?.("content-disposition") || "";
    return {
      blob: await response.blob(),
      filename: downloadFilename(disposition),
    };
  } catch (error) {
    if (logErrors) console.error("Download Error:", error);
    throw error;
  }
}

export function delay(ms = 400) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
