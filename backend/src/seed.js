require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Book = require("./models/Book");
const Category = require("./models/Category");
const Order = require("./models/Order");
const Review = require("./models/Review");
const Voucher = require("./models/Voucher");
const Conversation = require("./models/Conversation");
const Message = require("./models/Message");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/bookshop";

const users = [
  {
    name: "Admin",
    email: "admin@bookshop.com",
    password: "admin123",
    role: "admin",
  },
  {
    name: "Nguyễn Văn A",
    email: "user@bookshop.com",
    password: "user123",
    role: "user",
  },
];

const day = 24 * 3600_000;
const now = Date.now();

const vouchers = [
  {
    code: "WELCOME10",
    type: "percent",
    value: 10,
    minOrder: 200000,
    maxDiscount: 50000,
    startAt: new Date(now - 10 * day),
    endAt: new Date(now + 30 * day),
    usageLimit: 500,
    usedCount: 128,
    active: true,
    description: "Giảm 10% cho khách hàng mới",
  },
  {
    code: "FREESHIP",
    type: "fixed",
    value: 30000,
    minOrder: 150000,
    maxDiscount: 30000,
    startAt: new Date(now - 5 * day),
    endAt: new Date(now + 60 * day),
    usageLimit: 1000,
    usedCount: 412,
    active: true,
    description: "Miễn phí vận chuyển đơn từ 150k",
  },
  {
    code: "SALE50",
    type: "percent",
    value: 50,
    minOrder: 500000,
    maxDiscount: 200000,
    startAt: new Date(now + 5 * day),
    endAt: new Date(now + 20 * day),
    usageLimit: 100,
    usedCount: 0,
    active: true,
    description: "Khuyến mãi Black Friday",
  },
];

async function seed() {
  try {
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    console.log("🗑️  Clearing existing data...");
    await Promise.all([
      User.deleteMany({}),
      Book.deleteMany({}),
      Category.deleteMany({}),
      Order.deleteMany({}),
      Review.deleteMany({}),
      Voucher.deleteMany({}),
      Conversation.deleteMany({}),
      Message.deleteMany({}),
    ]);

    console.log("👤 Seeding users...");
    const createdUsers = [];
    for (const userData of users) {
      const user = new User(userData);
      await user.save();
      createdUsers.push(user);
      console.log(`   ✅ Created user: ${user.email} (${user.role})`);
    }

    console.log("🎟️  Seeding vouchers...");
    await Voucher.insertMany(vouchers);
    console.log(`   ✅ Created ${vouchers.length} vouchers`);

    console.log("💬 Seeding conversations...");
    const customer = createdUsers.find((u) => u.role === "user");
    const conv = await Conversation.create({
      user: customer?._id,
      customerName: customer?.name,
      customerEmail: customer?.email,
      lastMessage: "Chào shop, đơn của em khi nào giao ạ?",
      lastAt: new Date(now - 2 * 60_000),
      unread: 1,
    });
    await Message.insertMany([
      {
        conversation: conv._id,
        from: "customer",
        text: "Chào shop ạ",
        at: new Date(now - 30 * 60_000),
      },
      {
        conversation: conv._id,
        from: "admin",
        text: "Dạ chào bạn, mình hỗ trợ gì ạ?",
        at: new Date(now - 25 * 60_000),
      },
      {
        conversation: conv._id,
        from: "customer",
        text: "Chào shop, đơn của em khi nào giao ạ?",
        at: new Date(now - 2 * 60_000),
      },
    ]);
    console.log("   ✅ Created 1 conversation with sample messages");

    console.log("\n🎉 Database seeded successfully!");
    console.log("\n📋 Login credentials:");
    console.log("   Admin: admin@bookshop.com / admin123");
    console.log("   User:  user@bookshop.com  / user123\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seed error:", error);
    process.exit(1);
  }
}

seed();
