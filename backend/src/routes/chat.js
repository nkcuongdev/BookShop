const express = require("express");
const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { auth, requirePermission } = require("../middleware/auth");
const { buildAutoReply } = require("../services/chatAutoReplyService");
const {
  createRateLimiter,
  normalizedIp,
  parsePositiveInt,
  safeRegex,
} = require("../utils/security");

const customerRouter = express.Router();
const adminRouter = express.Router();
const messageLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  keyPrefix: "chat-message",
  message: "Bạn gửi tin nhắn quá nhanh, vui lòng thử lại sau",
  keyGenerator: (req) => `${normalizedIp(req)}:${req.user?._id || "anonymous"}`,
});

const serializeConv = (conversation) => {
  const obj = conversation.toObject ? conversation.toObject() : conversation;
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
    needsHuman: Boolean(obj.needsHuman),
  };
};

const serializeMessage = (message) => {
  const obj = message.toObject ? message.toObject() : message;
  return {
    _id: obj._id,
    id: obj._id,
    from: obj.from,
    text: obj.text,
    at: obj.at || obj.createdAt,
    automated: Boolean(obj.automated),
    automationType: obj.automationType || null,
  };
};

function normalizeMessageText(value) {
  const text = typeof value === "string" ? value.split("\0").join("").trim() : "";
  if (!text || text.length > 2000) return null;
  return text;
}

async function getOrCreateConversation(user) {
  try {
    return await Conversation.findOneAndUpdate(
      { user: user._id },
      {
        $set: { customerName: user.name, customerEmail: user.email },
        $setOnInsert: {
          lastMessage: "",
          lastAt: new Date(),
          unread: 0,
          unreadCustomer: 0,
          needsHuman: false,
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true }
    );
  } catch (error) {
    if (error.code === 11000) return Conversation.findOne({ user: user._id });
    throw error;
  }
}

async function getMessagePage(conversationId, query = {}) {
  const limit = parsePositiveInt(query.limit, 50, 100);
  const filter = { conversation: conversationId };
  if (query.before) {
    if (!mongoose.isValidObjectId(query.before)) {
      const error = new Error("Invalid message cursor");
      error.statusCode = 400;
      throw error;
    }
    filter._id = { $lt: query.before };
  }
  const rows = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).reverse();
  return {
    messages: messages.map(serializeMessage),
    pageInfo: {
      hasMore,
      nextCursor: hasMore && messages.length ? String(messages[0]._id) : null,
    },
  };
}

function emitChat(req, conversationId, message, conversation = null) {
  const io = req.app.get("io");
  if (!io) return;
  const payload = {
    conversationId: String(conversationId),
    message: serializeMessage(message),
  };
  io.to(`conversation:${conversationId}`).emit("chat:message", payload);
  io.to("role:admin").emit("chat:conversation", {
    conversationId: String(conversationId),
    conversation: conversation ? serializeConv(conversation) : null,
  });
}

customerRouter.get("/me", auth, async (req, res) => {
  try {
    const conversation = await getOrCreateConversation(req.user);
    const page = await getMessagePage(conversation._id, req.query);
    if (conversation.unreadCustomer > 0) {
      await Conversation.updateOne({ _id: conversation._id }, { $set: { unreadCustomer: 0 } });
      conversation.unreadCustomer = 0;
    }
    res.json({
      success: true,
      data: { conversation: serializeConv(conversation), ...page },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Không thể tải hội thoại",
    });
  }
});

customerRouter.post("/me/messages", auth, messageLimiter, async (req, res) => {
  try {
    const text = normalizeMessageText(req.body?.text);
    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Tin nhắn phải có từ 1 đến 2000 ký tự",
      });
    }
    const conversation = await getOrCreateConversation(req.user);
    const message = await Message.create({
      conversation: conversation._id,
      from: "customer",
      text,
      at: new Date(),
    });
    const updated = await Conversation.findByIdAndUpdate(
      conversation._id,
      {
        $set: { lastMessage: message.text, lastAt: message.at },
        $inc: { unread: 1 },
      },
      { returnDocument: "after" }
    ).populate("user", "name email");
    emitChat(req, conversation._id, message, updated);

    let autoMessage = null;
    try {
      if (!conversation.needsHuman) {
        const autoReply = buildAutoReply(text);
        if (autoReply) {
          autoMessage = await Message.create({
            conversation: conversation._id,
            from: "admin",
            text: autoReply.text,
            automated: true,
            automationType: autoReply.type,
            at: new Date(),
          });
          const autoUpdated = await Conversation.findByIdAndUpdate(
            conversation._id,
            {
              $set: {
                lastMessage: autoMessage.text,
                lastAt: autoMessage.at,
                needsHuman: autoReply.needsHuman,
              },
              $inc: { unreadCustomer: 1 },
            },
            { returnDocument: "after" }
          ).populate("user", "name email");
          emitChat(req, conversation._id, autoMessage, autoUpdated);
          if (autoUpdated?.user?._id) {
            req.app.get("io")?.to(`user:${autoUpdated.user._id}`).emit("chat:message", {
              conversationId: String(autoUpdated._id),
              message: serializeMessage(autoMessage),
            });
          }
        }
      }
    } catch (error) {
      autoMessage = null;
      console.error("Chat auto reply failed", {
        requestId: req.id,
        conversationId: String(conversation._id),
        message: error.message,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        message: serializeMessage(message),
        autoReply: autoMessage ? serializeMessage(autoMessage) : null,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: "Không thể gửi tin nhắn" });
  }
});

adminRouter.use(auth, requirePermission("chat.read"));

adminRouter.get("/conversations", async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const limit = parsePositiveInt(req.query.limit, 30, 100);
    const filter = {};
    const search = safeRegex(req.query.search);
    if (search) filter.$or = [{ customerName: search }, { customerEmail: search }];
    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .populate("user", "name email")
        .sort({ lastAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Conversation.countDocuments(filter),
    ]);
    res.json({
      success: true,
      data: {
        conversations: conversations.map(serializeConv),
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch {
    res.status(500).json({ success: false, message: "Không thể tải hội thoại" });
  }
});

adminRouter.get("/conversations/:id/messages", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid conversation ID" });
    }
    const page = await getMessagePage(req.params.id, req.query);
    res.json({ success: true, data: page });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Không thể tải tin nhắn",
    });
  }
});

adminRouter.post("/conversations/:id/messages", requirePermission("chat.write"), messageLimiter, async (req, res) => {
  try {
    const text = normalizeMessageText(req.body?.text);
    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Tin nhắn phải có từ 1 đến 2000 ký tự",
      });
    }
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }
    const message = await Message.create({
      conversation: conversation._id,
      from: "admin",
      text,
      at: new Date(),
    });
    const updated = await Conversation.findByIdAndUpdate(
      conversation._id,
      {
        $set: {
          lastMessage: message.text,
          lastAt: message.at,
          unread: 0,
          needsHuman: false,
        },
        $inc: { unreadCustomer: 1 },
      },
      { returnDocument: "after" }
    ).populate("user", "name email");
    emitChat(req, conversation._id, message, updated);
    if (updated?.user?._id) {
      req.app.get("io")?.to(`user:${updated.user._id}`).emit("chat:message", {
        conversationId: String(updated._id),
        message: serializeMessage(message),
      });
    }
    res.status(201).json({ success: true, data: { message: serializeMessage(message) } });
  } catch {
    res.status(500).json({ success: false, message: "Không thể gửi tin nhắn" });
  }
});

adminRouter.patch("/conversations/:id/read", requirePermission("chat.write"), async (req, res) => {
  try {
    const conversation = await Conversation.findByIdAndUpdate(
      req.params.id,
      { $set: { unread: 0 } },
      { returnDocument: "after" }
    );
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }
    res.json({ success: true });
  } catch {
    res.status(400).json({ success: false, message: "Invalid conversation ID" });
  }
});

module.exports = { adminChatRouter: adminRouter, customerChatRouter: customerRouter };
