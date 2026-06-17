const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");

function getCookieValue(reqOrSocket, name) {
  const headers = reqOrSocket.headers || reqOrSocket.handshake?.headers || {};
  const cookieHeader = headers.cookie || "";
  const parts = cookieHeader.split(";").map((part) => part.trim());
  const prefix = `${name}=`;
  const match = parts.find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  return getCookieValue(req, "bookshop_token");
}

const auth = async (req, res, next) => {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Vui long dang nhap",
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.id || decoded.userId);

    if (!user || user.status === "banned") {
      return res.status(401).json({
        success: false,
        message: "Token khong hop le",
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Token het han hoac khong hop le",
    });
  }
};

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Chi admin moi co quyen truy cap",
    });
  }
  return next();
};

const optionalAuth = async (req, res, next) => {
  const token = getBearerToken(req);
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.id || decoded.userId);
    if (user && user.status !== "banned") {
      req.user = user;
    }
  } catch {
    // Invalid optional token is treated as anonymous.
  }

  return next();
};

module.exports = { auth, adminOnly, optionalAuth, getCookieValue };
