function sessionCookieOptions({ isProduction, frontendUrl, apiPublicUrl }) {
  if (isProduction) {
    const frontend = new URL(frontendUrl);
    const api = new URL(apiPublicUrl);
    if (
      frontend.protocol === "https:" &&
      api.protocol === "https:" &&
      frontend.origin !== api.origin
    ) {
      // Partition by the top-level storefront so cross-site API sessions also
      // work in browsers that block unpartitioned third-party cookies.
      return { sameSite: "none", secure: true, partitioned: true };
    }
  }

  return { sameSite: "lax", secure: isProduction };
}

module.exports = { sessionCookieOptions };
