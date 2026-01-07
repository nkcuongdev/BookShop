require("dotenv").config();

module.exports = {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET || "fallback_secret_key",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
};
