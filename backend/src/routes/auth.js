const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Book = require("../models/Book");
const Promotion = require("../models/Promotion");
const { toPublicBooks } = require("../serializers/bookSerializer");
const config = require("../config");
const {
  auth,
  getCookieValue,
  validateCsrf,
} = require("../middleware/auth");
const {
  CSRF_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  createSession,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  setSessionCookies,
  timingSafeEqual,
  verifyJwt,
} = require("../services/authService");
const {
  issueEmailChange,
  issueEmailVerification,
} = require("../services/accountTokenService");
const {
  sendEmailChangeNotice,
  sendEmailVerification,
} = require("../services/emailService");
const {
  createRateLimiter,
  hashRateLimitPart,
} = require("../utils/security");
const { AppError } = require("../middleware/errorHandler");

const roleRegistry = require("../services/roleRegistry");
const { DEFAULT_ROLE } = require("../config/permissions");

const router = express.Router();
const DUMMY_LOGIN_PASSWORD_HASH =
  "$2a$10$Zy3Ry7wfzcLjIEyomEoUvepGFJzTYfcSFugxahEm4DVNysH22abNC";
const MAX_ADDRESSES = 10;

function normalizeAddressInput(body = {}) {
  const address = {
    label: String(body.label || "Nhà").trim(),
    fullName: String(body.fullName || "").trim(),
    phone: String(body.phone || "").trim(),
    address: String(body.address || "").trim(),
    city: String(body.city || "").trim(),
    district: String(body.district || "").trim(),
    ward: String(body.ward || "").trim(),
    isDefault: body.isDefault === true,
  };
  if (!address.fullName || !address.phone || !address.address) {
    throw new AppError(422, "Vui lòng nhập đầy đủ thông tin địa chỉ", {
      code: "INVALID_ADDRESS",
    });
  }
  if (
    address.label.length > 40 ||
    address.fullName.length > 100 ||
    address.phone.length < 6 ||
    address.phone.length > 20 ||
    !/^[0-9+().\s-]+$/.test(address.phone) ||
    address.address.length > 500 ||
    address.city.length > 100 ||
    address.district.length > 100 ||
    address.ward.length > 100
  ) {
    throw new AppError(422, "Thông tin địa chỉ không hợp lệ", {
      code: "INVALID_ADDRESS",
    });
  }
  return address;
}
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  max: 5,
  keyPrefix: "register",
  message: "Too many registrations, please try again later",
});
const loginIpLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 30,
  keyPrefix: "login-ip",
  message: "Too many login attempts, please try again later",
  skipSuccessfulRequests: true,
});
const loginAccountLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 10,
  keyPrefix: "login-account",
  message: "Too many login attempts, please try again later",
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    return hashRateLimitPart(email);
  },
});
const refreshLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 60,
  keyPrefix: "refresh",
  message: "Too many refresh attempts, please try again later",
});
const csrfBootstrapLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 60,
  keyPrefix: "csrf-bootstrap",
  message: "Too many session bootstrap attempts, please try again later",
});

/**
 * The client shape of a user. `permissions` is the effective grant list for the
 * user's role, resolved from the role registry: the frontend gates its UI on
 * this instead of keeping its own copy of the role table, so the two can never
 * drift. The API enforces the same table on every request regardless.
 */
const serializeUser = async (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || "",
  addresses: user.addresses || [],
  wishlist: user.wishlist || [],
  role: user.role,
  roleLabel: await roleRegistry.roleLabel(user.role),
  permissions: await roleRegistry.permissionsForRole(user.role),
  emailVerified: Boolean(user.emailVerifiedAt),
  pendingEmail: user.pendingEmail || "",
});

function isValidPassword(value) {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    Buffer.byteLength(value, "utf8") <= 72
  );
}

function isValidEmail(value) {
  return (
    typeof value === "string" &&
    value.trim().length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

// Register
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 100 ||
      !isValidEmail(email) ||
      typeof password !== "string" ||
      (phone !== undefined &&
        (typeof phone !== "string" || phone.trim().length > 30))
    ) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ thông tin",
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu cần từ 8 ký tự và không quá 72 byte",
      });
    }

    // Check if email exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email đã được sử dụng",
      });
    }

    // Create user
    const user = new User({
      name: name.trim(),
      email: email.trim(),
      password,
      phone: typeof phone === "string" ? phone.trim() : "",
      // Registration always creates a customer; staff roles are assigned by an
      // admin through /api/admin/users/:id/role.
      role: DEFAULT_ROLE,
    });
    await user.save();

    const verificationToken = await issueEmailVerification(user);
    const verificationUrl = `${config.frontendUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;
    const verificationDelivery = await sendEmailVerification(
      user.email,
      verificationUrl
    ).catch((error) => {
      console.error("Unable to send registration verification email", {
        message: error.message,
      });
      return { delivered: false };
    });

    const tokens = await createSession(user, req);
    setSessionCookies(res, tokens);

    res.status(201).json({
      success: true,
      message: "Đăng ký thành công",
      data: {
        user: await serializeUser(user),
        csrfToken: tokens.csrf,
        verificationRequired: true,
        verificationEmailSent: Boolean(verificationDelivery?.delivered),
        ...(process.env.NODE_ENV === "production" ? {} : { verificationUrl }),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Login
router.post("/login", loginIpLimiter, loginAccountLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      !isValidEmail(email) ||
      typeof password !== "string" ||
      !password ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập email và mật khẩu",
      });
    }

    // Find user
    const user = await User.findByEmail(email).select("+tokenVersion");
    const isMatch = user
      ? await user.comparePassword(password)
      : await bcrypt.compare(password, DUMMY_LOGIN_PASSWORD_HASH);
    if (!user || !isMatch) {
      return res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    if (user.status === "banned") {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị cấm",
      });
    }

    const tokens = await createSession(user, req);
    setSessionCookies(res, tokens);

    res.json({
      success: true,
      message: "Đăng nhập thành công",
      data: {
        user: await serializeUser(user),
        csrfToken: tokens.csrf,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

router.get("/csrf", csrfBootstrapLimiter, (req, res) => {
  try {
    const refreshToken = getCookieValue(req, REFRESH_COOKIE);
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: "Missing refresh token" });
    }
    const decoded = verifyJwt(refreshToken, "refresh");
    const csrfCookie = getCookieValue(req, CSRF_COOKIE);
    if (!csrfCookie || !timingSafeEqual(csrfCookie, decoded.csrf)) {
      return res.status(403).json({ success: false, message: "Invalid CSRF cookie" });
    }
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data: { csrfToken: decoded.csrf } });
  } catch {
    clearSessionCookies(res);
    return res.status(401).json({ success: false, message: "Refresh session expired" });
  }
});

router.post("/refresh", refreshLimiter, async (req, res) => {
  try {
    const refreshToken = getCookieValue(req, REFRESH_COOKIE);
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: "Missing refresh token" });
    }
    const decoded = verifyJwt(refreshToken, "refresh");
    if (!validateCsrf(req, decoded.csrf)) {
      return res.status(403).json({ success: false, message: "Invalid CSRF token" });
    }
    const tokens = await rotateSession(refreshToken, req);
    setSessionCookies(res, tokens);
    return res.json({
      success: true,
      data: { user: await serializeUser(tokens.user), csrfToken: tokens.csrf },
    });
  } catch {
    clearSessionCookies(res);
    return res.status(401).json({ success: false, message: "Refresh session expired" });
  }
});

router.post("/logout", auth, async (req, res) => {
  await revokeSession(req.auth.sid).catch(() => null);
  clearSessionCookies(res);
  res.json({ success: true });
});

// Get current user
router.get("/me", auth, async (req, res, next) => {
  try {
    res.json({ success: true, data: { user: await serializeUser(req.user) } });
  } catch (error) {
    next(error);
  }
});

// Update profile
router.put("/me", auth, async (req, res) => {
  try {
    const { name, email, password, phone, currentPassword } = req.body;
    const user = await User.findById(req.user._id);
    let emailChangeToken = null;
    let emailChangeUrl = null;

    if (password !== undefined) {
      return res.status(400).json({
        success: false,
        message: "Vui long dung chuc nang doi mat khau",
      });
    }

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
        return res.status(400).json({ success: false, message: "Tên không hợp lệ" });
      }
      user.name = name.trim();
    }
    if (phone !== undefined) {
      if (typeof phone !== "string" || phone.trim().length > 30) {
        return res.status(400).json({ success: false, message: "Số điện thoại không hợp lệ" });
      }
      user.phone = phone.trim();
    }
    if (email !== undefined) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, message: "Email không hợp lệ" });
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (normalizedEmail !== user.email) {
        if (
          typeof currentPassword !== "string" ||
          !currentPassword ||
          Buffer.byteLength(currentPassword, "utf8") > 72
        ) {
          return res.status(400).json({
            success: false,
            message: "Vui lòng nhập mật khẩu hiện tại để đổi email",
          });
        }
        if (!(await user.comparePassword(currentPassword))) {
          return res.status(400).json({
            success: false,
            message: "Mật khẩu hiện tại không đúng",
          });
        }
        const existing = await User.findOne({
          _id: { $ne: user._id },
          email: normalizedEmail,
        });
        if (existing) {
          return res.status(409).json({
            success: false,
            message: "Email đã được sử dụng",
          });
        }
        emailChangeToken = await issueEmailChange(user, normalizedEmail);
        emailChangeUrl = `${config.frontendUrl}/verify-email?token=${encodeURIComponent(emailChangeToken)}`;
        await sendEmailVerification(normalizedEmail, emailChangeUrl);
        await sendEmailChangeNotice(user.email, normalizedEmail).catch((error) => {
          console.error("Unable to send email change notice", {
            message: error.message,
          });
        });
      }
    }
    if (!emailChangeToken) await user.save();

    res.json({
      success: true,
      message: emailChangeToken
        ? "Đã gửi liên kết xác minh tới email mới"
        : "Cập nhật thành công",
      data: {
        user: await serializeUser(user),
        emailChangePending: Boolean(emailChangeToken),
        ...(emailChangeToken && process.env.NODE_ENV !== "production"
          ? { verificationUrl: emailChangeUrl }
          : {}),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Change password
router.patch("/me/password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (
      typeof currentPassword !== "string" ||
      !currentPassword ||
      Buffer.byteLength(currentPassword, "utf8") > 72 ||
      typeof newPassword !== "string" ||
      !newPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ thông tin mật khẩu",
      });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu mới cần từ 8 ký tự và không quá 72 byte",
      });
    }

    const user = await User.findById(req.user._id).select(
      "+tokenVersion +emailChangeTokenHash +emailChangeExpiresAt +passwordResetTokenHash +passwordResetExpiresAt"
    );
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu hiện tại không đúng",
      });
    }

    user.password = newPassword;
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    user.pendingEmail = undefined;
    user.emailChangeTokenHash = undefined;
    user.emailChangeExpiresAt = undefined;
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();
    await revokeAllSessions(user._id);
    clearSessionCookies(res);

    return res.json({
      success: true,
      message: "Đổi mật khẩu thành công",
      data: { reauthRequired: true },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Get my addresses
router.get("/me/addresses", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("addresses");
    res.json({
      success: true,
      data: { addresses: user?.addresses || [] },
    });
  } catch (error) {
    next(error);
  }
});

// Add address
router.post("/me/addresses", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (user.addresses.length >= MAX_ADDRESSES) {
      throw new AppError(422, `Chỉ có thể lưu tối đa ${MAX_ADDRESSES} địa chỉ`, {
        code: "ADDRESS_LIMIT_REACHED",
      });
    }
    const nextAddress = normalizeAddressInput(req.body);
    user.addresses.push(nextAddress);

    if (user.addresses.length === 1) {
      user.addresses[0].isDefault = true;
    } else if (nextAddress.isDefault) {
      const newId = user.addresses[user.addresses.length - 1]._id;
      user.addresses = user.addresses.map((a) => ({
        ...a.toObject(),
        isDefault: String(a._id) === String(newId),
      }));
    }

    await user.save();
    res.json({
      success: true,
      message: "Đã thêm địa chỉ",
      data: { addresses: user.addresses },
    });
  } catch (error) {
    next(error);
  }
});

// Update address
router.put("/me/addresses/:addressId", auth, async (req, res, next) => {
  try {
    const nextAddress = normalizeAddressInput(req.body);
    const user = await User.findById(req.user._id);
    const idx = user.addresses.findIndex(
      (a) => String(a._id) === String(req.params.addressId)
    );

    if (idx === -1) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa chỉ",
      });
    }

    user.addresses[idx].label = nextAddress.label;
    user.addresses[idx].fullName = nextAddress.fullName;
    user.addresses[idx].phone = nextAddress.phone;
    user.addresses[idx].address = nextAddress.address;
    user.addresses[idx].city = nextAddress.city;
    user.addresses[idx].district = nextAddress.district;
    user.addresses[idx].ward = nextAddress.ward;

    if (nextAddress.isDefault) {
      user.addresses = user.addresses.map((a) => ({
        ...a.toObject(),
        isDefault: String(a._id) === String(req.params.addressId),
      }));
    }

    await user.save();
    res.json({
      success: true,
      message: "Đã cập nhật địa chỉ",
      data: { addresses: user.addresses },
    });
  } catch (error) {
    next(error);
  }
});

// Delete address
router.delete("/me/addresses/:addressId", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const prevLength = user.addresses.length;
    user.addresses = user.addresses.filter(
      (a) => String(a._id) !== String(req.params.addressId)
    );

    if (user.addresses.length === prevLength) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa chỉ",
      });
    }

    if (user.addresses.length && !user.addresses.some((a) => a.isDefault)) {
      user.addresses[0].isDefault = true;
    }

    await user.save();
    res.json({
      success: true,
      message: "Đã xóa địa chỉ",
      data: { addresses: user.addresses },
    });
  } catch (error) {
    next(error);
  }
});

// Set default address
router.patch("/me/addresses/:addressId/default", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const exists = user.addresses.some(
      (a) => String(a._id) === String(req.params.addressId)
    );

    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy địa chỉ",
      });
    }

    user.addresses = user.addresses.map((a) => ({
      ...a.toObject(),
      isDefault: String(a._id) === String(req.params.addressId),
    }));
    await user.save();

    res.json({
      success: true,
      message: "Đã đặt làm địa chỉ mặc định",
      data: { addresses: user.addresses },
    });
  } catch (error) {
    next(error);
  }
});

// Get my wishlist (book details)
router.get("/me/wishlist", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("wishlist");
    const books = (user?.wishlist || []).filter(Boolean);
    const decorated = await Promotion.decorateBooks(books);
    res.json({
      success: true,
      data: {
        items: toPublicBooks(decorated),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Toggle wishlist item
router.post("/me/wishlist/:bookId", auth, async (req, res) => {
  try {
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sách",
      });
    }

    const user = await User.findById(req.user._id);
    const already = user.wishlist.some(
      (id) => String(id) === String(req.params.bookId)
    );

    if (already) {
      user.wishlist = user.wishlist.filter(
        (id) => String(id) !== String(req.params.bookId)
      );
    } else {
      user.wishlist.push(req.params.bookId);
    }

    await user.save();
    res.json({
      success: true,
      data: { wished: !already, wishlist: user.wishlist },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Clear wishlist
router.delete("/me/wishlist", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.wishlist = [];
    await user.save();
    res.json({ success: true, message: "Đã xóa danh sách yêu thích" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

module.exports = router;
