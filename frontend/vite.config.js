import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Image hosts allowed by the CSP in index.html. Must stay a superset of the
// backend allowlist in backend/src/utils/imageUrlPolicy.js, otherwise the
// browser blocks an image the API already accepted.
const DEFAULT_CSP_IMG_SRC = [
  "http://localhost:5000",
  "https://res.cloudinary.com",
  "https://images.unsplash.com",
  "https://m.media-amazon.com",
  "https://via.placeholder.com",
];

function cspPlugin(env, isDev) {
  const extra = String(env.VITE_ALLOWED_IMAGE_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const imgSrc = [...new Set([...DEFAULT_CSP_IMG_SRC, ...extra])].join(" ");
  // The dev server injects the react-refresh preamble and the HMR client as
  // inline module scripts, so serve mode needs 'unsafe-inline'. The production
  // build only emits external bundles, so it keeps the strict 'self' policy.
  const scriptSrc = isDev ? "'self' 'unsafe-inline'" : "'self'";
  return {
    name: "bookshop-csp",
    transformIndexHtml(html) {
      return html
        .replaceAll("%VITE_CSP_IMG_SRC%", imgSrc)
        .replaceAll("%VITE_CSP_SCRIPT_SRC%", scriptSrc);
    },
  };
}

export default defineConfig(({ mode, command }) => ({
  plugins: [
    react(),
    cspPlugin(loadEnv(mode, process.cwd(), ""), command === "serve"),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    chunkSizeWarningLimit: 600,
  },
}));
