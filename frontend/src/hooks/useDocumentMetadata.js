import { useEffect } from "react";

function upsertMeta(attribute, key, content) {
  if (!content) return;
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function removeMeta(attribute, key) {
  document.head.querySelector(`meta[${attribute}="${key}"]`)?.remove();
}

function absoluteUrl(value, baseUrl) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

export function getSiteUrl() {
  const configured = String(import.meta.env.VITE_SITE_URL || "").trim();
  const fallback = typeof window !== "undefined" ? window.location.origin : "";
  return (configured || fallback).replace(/\/$/, "");
}

export default function useDocumentMetadata({
  title,
  description,
  canonicalPath,
  image,
  type = "website",
  robots = "index,follow",
  structuredData,
}) {
  useEffect(() => {
    const siteUrl = getSiteUrl();
    const canonical = absoluteUrl(canonicalPath || window.location.pathname, siteUrl);
    const absoluteImage = absoluteUrl(image, siteUrl);

    if (title) document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", robots);
    upsertMeta("property", "og:locale", "vi_VN");
    upsertMeta("property", "og:site_name", "BookShop");
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("name", "twitter:card", absoluteImage ? "summary_large_image" : "summary");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    if (absoluteImage) {
      upsertMeta("property", "og:image", absoluteImage);
      upsertMeta("name", "twitter:image", absoluteImage);
    } else {
      removeMeta("property", "og:image");
      removeMeta("name", "twitter:image");
    }

    let canonicalElement = document.head.querySelector('link[rel="canonical"]');
    if (!canonicalElement) {
      canonicalElement = document.createElement("link");
      canonicalElement.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalElement);
    }
    canonicalElement.setAttribute("href", canonical);

    const previousJsonLd = document.head.querySelector('script[data-bookshop-json-ld="true"]');
    previousJsonLd?.remove();
    if (structuredData) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.bookshopJsonLd = "true";
      script.textContent = JSON.stringify(structuredData).replace(/</g, "\\u003c");
      document.head.appendChild(script);
    }
  }, [canonicalPath, description, image, robots, structuredData, title, type]);
}
