const assert = require("node:assert/strict");
const { test } = require("node:test");
const cookie = require("cookie");
const { sessionCookieOptions } = require("../src/utils/sessionCookieOptions");

test("separate HTTPS Render hosts issue partitioned cross-site session cookies", () => {
  const options = sessionCookieOptions({
    isProduction: true,
    frontendUrl: "https://bookshop-web.onrender.com",
    apiPublicUrl: "https://bookshop-api-2osm.onrender.com",
  });
  const header = cookie.serialize("bookshop_access", "session", {
    ...options,
    httpOnly: true,
    path: "/",
  });
  assert.match(header, /; SameSite=None/);
  assert.match(header, /; Secure/);
  assert.match(header, /; Partitioned/);
  assert.match(header, /; HttpOnly/);
});

test("a same-origin production storefront retains secure Lax cookies", () => {
  const options = sessionCookieOptions({
    isProduction: true,
    frontendUrl: "https://bookshop-api.onrender.com/",
    apiPublicUrl: "https://bookshop-api.onrender.com",
  });
  const header = cookie.serialize("bookshop_access", "session", options);
  assert.match(header, /; SameSite=Lax/);
  assert.match(header, /; Secure/);
  assert.doesNotMatch(header, /; Partitioned/);
});

test("local development keeps cookies usable over HTTP", () => {
  const options = sessionCookieOptions({
    isProduction: false,
    frontendUrl: "http://localhost:5173",
    apiPublicUrl: "http://localhost:5000",
  });
  const header = cookie.serialize("bookshop_access", "session", options);
  assert.match(header, /; SameSite=Lax/);
  assert.doesNotMatch(header, /; (Secure|Partitioned)/);
});

test("cross-site cookie mode requires HTTPS on both public origins", () => {
  const options = sessionCookieOptions({
    isProduction: true,
    frontendUrl: "http://bookshop-web.example",
    apiPublicUrl: "https://bookshop-api.example",
  });
  assert.equal(options.sameSite, "lax");
  assert.equal(options.partitioned, undefined);
});
