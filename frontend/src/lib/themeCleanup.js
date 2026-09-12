/**
 * One-time migration for the removed dark mode.
 *
 * The app previously shipped a `useTheme` hook that toggled a `dark` class on
 * <html> and persisted the choice under this key. Both are gone, but a returning
 * visitor still has the class applied on first paint (nothing removes it) and the
 * key sitting in localStorage forever. With the `.dark` token block deleted, that
 * stale class no longer changes any colour — it is just dead state — so this
 * clears it rather than leaving it to accumulate.
 *
 * Safe to delete once enough time has passed that no active session predates the
 * dark-mode removal.
 */
const LEGACY_STORAGE_KEY = "bookshop_admin_theme";

export function cleanupLegacyTheme() {
  if (typeof document === "undefined") return;

  document.documentElement.classList.remove("dark");

  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage can be disabled by privacy settings; removing the class is the
    // part that actually affects rendering, and it already ran above.
  }
}
