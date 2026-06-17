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

const categories = [
  { name: "Van hoc", slug: "van-hoc", description: "Tieu thuyet, truyen ngan va tac pham kinh dien" },
  { name: "Kinh doanh", slug: "kinh-doanh", description: "Quan tri, tai chinh va khoi nghiep" },
  { name: "Cong nghe", slug: "cong-nghe", description: "Lap trinh, kien truc phan mem va du lieu" },
  { name: "Ky nang song", slug: "ky-nang-song", description: "Phat trien ban than va thoi quen" },
];

const books = [
  {
    title: "Clean Code",
    author: "Robert C. Martin",
    category: "cong-nghe",
    price: 320000,
    stock: 25,
    sold: 68,
    rating: 4.8,
    reviewCount: 12,
    publisher: "Prentice Hall",
    language: "English",
    tags: ["programming", "software-engineering"],
    imageUrl: "https://m.media-amazon.com/images/I/41SH-SvWPxL._SY445_SX342_.jpg",
    description: "Huong dan viet code de doc, de bao tri va giam loi trong du an phan mem.",
  },
  {
    title: "Atomic Habits",
    author: "James Clear",
    category: "ky-nang-song",
    price: 189000,
    stock: 40,
    sold: 120,
    rating: 4.9,
    reviewCount: 34,
    publisher: "Avery",
    language: "Vietnamese",
    tags: ["habits", "self-help"],
    imageUrl: "https://m.media-amazon.com/images/I/81ANaVZk5LL._SY466_.jpg",
    description: "Cach xay dung thoi quen nho nhung tao tac dong lon theo thoi gian.",
  },
  {
    title: "Dac Nhan Tam",
    author: "Dale Carnegie",
    category: "ky-nang-song",
    price: 86000,
    stock: 55,
    sold: 210,
    rating: 4.7,
    reviewCount: 45,
    publisher: "Tong hop TP.HCM",
    language: "Vietnamese",
    tags: ["communication", "classic"],
    imageUrl: "https://m.media-amazon.com/images/I/71vK0WVQ4rL._SY466_.jpg",
    description: "Tac pham kinh dien ve giao tiep va xay dung moi quan he.",
  },
  {
    title: "The Lean Startup",
    author: "Eric Ries",
    category: "kinh-doanh",
    price: 230000,
    stock: 18,
    sold: 74,
    rating: 4.6,
    reviewCount: 16,
    publisher: "Crown Business",
    language: "English",
    tags: ["startup", "business"],
    imageUrl: "https://m.media-amazon.com/images/I/81-QB7nDh4L._SY466_.jpg",
    description: "Phuong phap xay dung san pham, do luong va hoc nhanh trong startup.",
  },
  {
    title: "Nha Gia Kim",
    author: "Paulo Coelho",
    category: "van-hoc",
    price: 79000,
    stock: 34,
    sold: 156,
    rating: 4.8,
    reviewCount: 29,
    publisher: "NXB Hoi Nha Van",
    language: "Vietnamese",
    tags: ["novel", "classic"],
    imageUrl: "https://m.media-amazon.com/images/I/71aFt4+OTOL._SY466_.jpg",
    description: "Cau chuyen ve hanh trinh theo duoi uoc mo va lang nghe trai tim.",
  },
  {
    title: "Designing Data-Intensive Applications",
    author: "Martin Kleppmann",
    category: "cong-nghe",
    price: 520000,
    stock: 12,
    sold: 41,
    rating: 4.9,
    reviewCount: 11,
    publisher: "O'Reilly Media",
    language: "English",
    tags: ["database", "architecture"],
    imageUrl: "https://m.media-amazon.com/images/I/91YfNb49PLL._SY466_.jpg",
    description: "Nen tang ve he thong du lieu, replication, partitioning va distributed systems.",
  },
];

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
    console.log("Seeding categories...");
    await Category.insertMany(categories);
    console.log(`   Created ${categories.length} categories`);

    console.log("Seeding books...");
    await Book.insertMany(books);
    console.log(`   Created ${books.length} books`);

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
