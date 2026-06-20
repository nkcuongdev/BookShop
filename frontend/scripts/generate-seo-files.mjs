import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME || "";
const siteUrl = String(
  process.env.VITE_SITE_URL ||
    (process.env.VITE_SITE_HOST
      ? `https://${process.env.VITE_SITE_HOST}`
      : renderHost
        ? `https://${renderHost}`
        : "http://localhost:5173")
).replace(/\/$/, "");
const apiBaseUrl = String(
  process.env.VITE_API_BASE_URL ||
    (process.env.VITE_API_HOST
      ? `https://${process.env.VITE_API_HOST}/api`
      : renderHost
        ? `https://${renderHost}/api`
        : "")
).replace(/\/$/, "");
const outputDir = resolve(process.cwd(), "dist");

const paths = new Map([
  ["/", null],
  ["/products", null],
  ["/news", null],
  ["/support/shipping", null],
  ["/support/returns", null],
  ["/support/faq", null],
  ["/support/contact", null],
  ["/terms", null],
  ["/privacy", null],
]);

async function fetchJson(path) {
  if (!apiBaseUrl) return null;
  const response = await fetch(`${apiBaseUrl}${path}`, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`SEO fetch failed with ${response.status}`);
  return response.json();
}

async function addBookUrls() {
  for (let page = 1; page <= 490; page += 1) {
    const payload = await fetchJson(`/books?page=${page}&limit=100`);
    const books = payload?.data?.books || [];
    for (const book of books) {
      const id = book._id || book.id;
      if (id) paths.set(`/books/${id}`, book.updatedAt || book.createdAt || null);
    }
    const totalPages = Number(payload?.data?.pagination?.totalPages || 1);
    if (!books.length || page >= totalPages) break;
  }
}

async function addNewsUrls() {
  const payload = await fetchJson("/posts?status=published&limit=100");
  for (const post of payload?.data?.posts || []) {
    if (post.slug) paths.set(`/news/${post.slug}`, post.updatedAt || post.publishedAt || null);
  }
}

if (apiBaseUrl) {
  await Promise.allSettled([addBookUrls(), addNewsUrls()]);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const urls = [...paths.entries()]
  .map(([path, modified]) => {
    const lastmod = modified && !Number.isNaN(new Date(modified).getTime())
      ? `\n    <lastmod>${new Date(modified).toISOString()}</lastmod>`
      : "";
    return `  <url>\n    <loc>${escapeXml(`${siteUrl}${path}`)}</loc>${lastmod}\n  </url>`;
  })
  .join("\n");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
const robots = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /profile\nDisallow: /cart\nDisallow: /checkout\nDisallow: /payment-result\nSitemap: ${siteUrl}/sitemap.xml\n`;

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, "sitemap.xml"), sitemap, "utf8"),
  writeFile(resolve(outputDir, "robots.txt"), robots, "utf8"),
]);
