export function safeInternalRedirect(value, fallback = "/") {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) {
    return fallback;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  const hasUnsafeCharacter = [...decoded].some((character) => {
    const code = character.charCodeAt(0);
    return character === "\\" || code <= 31 || code === 127;
  });
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    decoded.startsWith("//") ||
    hasUnsafeCharacter
  ) {
    return fallback;
  }

  try {
    const base = new URL("https://bookshop.invalid/");
    const target = new URL(value, base);
    if (target.origin !== base.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
