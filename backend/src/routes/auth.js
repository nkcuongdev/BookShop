const express = require("express");
const User = require("../models/User");
const Book = require("../models/Book");
const { auth } = require("../middleware/auth");
const { createRateLimiter } = require("../utils/security");

const router = express.Router();
const authLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 30,
  keyPrefix: "auth",
  message: "Too many auth attempts, please try again later",
});

function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("bookshop_token", token, {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearAuthCookie(res) {
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie("bookshop_token", {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    path: "/",
  });
}

// Register
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ thông tin",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mat khau can it nhat 6 ky tu",
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
    const user = new User({ name, email, password, phone, role: "user" });
    await user.save();

    // Generate token
    const token = user.generateToken();
    setAuthCookie(res, token);

    res.status(201).json({
      success: true,
      message: "Đăng ký thành công",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone || "",
          addresses: user.addresses || [],
          wishlist: user.wishlist || [],
          role: user.role,
        },
        token,
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
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập email và mật khẩu",
      });
    }

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
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

    // Generate token
    const token = user.generateToken();
    setAuthCookie(res, token);

    res.json({
      success: true,
      message: "Đăng nhập thành công",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone || "",
          addresses: user.addresses || [],
          wishlist: user.wishlist || [],
          role: user.role,
        },
        token,
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

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

// Get current user
router.get("/me", auth, (req, res) => {
  res.json({
    success: true,
    data: {
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone || "",
        addresses: req.user.addresses || [],
        wishlist: req.user.wishlist || [],
        role: req.user.role,
      },
    },
  });
});

// Update profile
router.put("/me", auth, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    const user = await User.findById(req.user._id);

    if (name) user.name = name;
    if (typeof phone === "string") user.phone = phone.trim();
    if (email && email !== user.email) {
      const existing = await User.findByEmail(email);
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Email đã được sử dụng",
        });
      }
      user.email = email;
    }
    if (password) {
      return res.status(400).json({
        success: false,
        message: "Vui long dung chuc nang doi mat khau",
      });
    }

    await user.save();

    res.json({
      success: true,
      message: "Cập nhật thành công",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone || "",
          addresses: user.addresses || [],
          wishlist: user.wishlist || [],
          role: user.role,
        },
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

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ thông tin mật khẩu",
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu mới cần ít nhất 6 ký tự",
      });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu hiện tại không đúng",
      });
    }

    user.password = newPassword;
    await user.save();

    return res.json({
      success: true,
      message: "Đổi mật khẩu thành công",
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
router.get("/me/addresses", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("addresses");
    res.json({
      success: true,
      data: { addresses: user?.addresses || [] },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Add address
router.post("/me/addresses", auth, async (req, res) => {
  try {
    const { label, fullName, phone, address, isDefault } = req.body || {};
    if (!fullName || !phone || !address) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ thông tin",
      });
    }

    const user = await User.findById(req.user._id);
    const nextAddress = {
      label: label || "Nhà",
      fullName,
      phone,
      address,
      isDefault: !!isDefault,
    };
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
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Update address
router.put("/me/addresses/:addressId", auth, async (req, res) => {
  try {
    const { label, fullName, phone, address, isDefault } = req.body || {};
    if (!fullName || !phone || !address) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ thông tin",
      });
    }

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

    user.addresses[idx].label = label || "Nhà";
    user.addresses[idx].fullName = fullName;
    user.addresses[idx].phone = phone;
    user.addresses[idx].address = address;

    if (typeof isDefault === "boolean" && isDefault) {
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
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Delete address
router.delete("/me/addresses/:addressId", auth, async (req, res) => {
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
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Set default address
router.patch("/me/addresses/:addressId/default", auth, async (req, res) => {
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
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// Get my wishlist (book details)
router.get("/me/wishlist", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("wishlist");
    res.json({
      success: true,
      data: {
        items: (user?.wishlist || []).filter(Boolean),
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
