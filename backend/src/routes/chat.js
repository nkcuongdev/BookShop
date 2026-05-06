const express = require("express");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { auth, adminOnly } = require("../middleware/auth");

const router = express.Router();

const serializeConv = (c) => {
  const obj = c.toObject ? c.toObject() : c;
  return {
    _id: obj._id,
    id: obj._id,
    customer: {
      name: obj.user?.name || obj.customerName || "Khách",
      email: obj.user?.email || obj.customerEmail || "",
      avatar: "",
    },
    lastMessage: obj.lastMessage,
    lastAt: obj.lastAt,
    unread: obj.unread || 0,
    unreadCustomer: obj.unreadCustomer || 0,
  };
};

const serializeMessage = (m) => {
  const obj = m.toObject ? m.toObject() : m;
  return {
    _id: obj._id,
    id: obj._id,
    from: obj.from,
    text: obj.text,
    at: obj.at || obj.createdAt,
  };
};

// ============================================================
// CUSTOMER endpoints (must be logged-in user)
// ============================================================

// GET /api/chat/me  -> lấy/tạo hội thoại của khách hàng hiện tại + danh sách tin nhắn
router.get("/me", auth, async (req, res) => {
  try {
    let conv = await Conversation.findOne({ user: req.user._id });
    if (!conv) {
      conv = await Conversation.create({
        user: req.user._id,
        customerName: req.user.name,
        customerEmail: req.user.email,
        lastMessage: "",
        lastAt: new Date(),
        unread: 0,
        unreadCustomer: 0,
      });
    }
    const messages = await Message.find({ conversation: conv._id }).sort({ at: 1 });

    // mark customer-side as read
    if (conv.unreadCustomer && conv.unreadCustomer > 0) {
      conv.unreadCustomer = 0;
      await conv.save();
    }

    res.json({
      success: true,
      data: {
        conversation: serializeConv(conv),
        messages: messages.map(serializeMessage),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// POST /api/chat/me/messages  -> khách hàng gửi tin nhắn
router.post("/me/messages", auth, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: "Nội dung trống" });
    }

    let conv = await Conversation.findOne({ user: req.user._id });
    if (!conv) {
      conv = await Conversation.create({
        user: req.user._id,
        customerName: req.user.name,
        customerEmail: req.user.email,
      });
    }

    const msg = await Message.create({
      conversation: conv._id,
      from: "customer",
      text: text.trim(),
      at: new Date(),
    });

    conv.lastMessage = msg.text;
    conv.lastAt = msg.at;
    conv.unread = (conv.unread || 0) + 1; // admin chưa đọc
    await conv.save();

    res.status(201).json({
      success: true,
      data: { message: serializeMessage(msg) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// ============================================================
// ADMIN endpoints
// ============================================================
router.use(auth, adminOnly);

// GET /api/admin/chat/conversations
router.get("/conversations", async (req, res) => {
  try {
    const list = await Conversation.find()
      .populate("user", "name email")
      .sort({ lastAt: -1 });
    res.json({
      success: true,
      data: { conversations: list.map(serializeConv) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// GET /api/admin/chat/conversations/:id/messages
router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const messages = await Message.find({ conversation: req.params.id }).sort({
      at: 1,
    });
    res.json({
      success: true,
      data: { messages: messages.map(serializeMessage) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// POST /api/admin/chat/conversations/:id/messages
router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: "Nội dung trống" });
    }

    const conv = await Conversation.findById(req.params.id);
    if (!conv) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hội thoại" });
    }

    const msg = await Message.create({
      conversation: conv._id,
      from: "admin",
      text: text.trim(),
      at: new Date(),
    });

    conv.lastMessage = msg.text;
    conv.lastAt = msg.at;
    conv.unread = 0;
    conv.unreadCustomer = (conv.unreadCustomer || 0) + 1; // khách chưa đọc
    await conv.save();

    res.status(201).json({
      success: true,
      data: { message: serializeMessage(msg) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

// PATCH /api/admin/chat/conversations/:id/read
router.patch("/conversations/:id/read", async (req, res) => {
  try {
    const conv = await Conversation.findByIdAndUpdate(
      req.params.id,
      { unread: 0 },
      { new: true }
    );
    if (!conv) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hội thoại" });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
});

module.exports = router;
