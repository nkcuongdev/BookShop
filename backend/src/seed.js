require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Book = require("./models/Book");
const Category = require("./models/Category");
const Order = require("./models/Order");
const Review = require("./models/Review");

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

async function seed() {
  try {
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Clear all data
    console.log("🗑️  Clearing existing data...");
    await Promise.all([
      User.deleteMany({}),
      Book.deleteMany({}),
      Category.deleteMany({}),
      Order.deleteMany({}),
      Review.deleteMany({}),
    ]);

    // Seed users only
    console.log("👤 Seeding users...");
    for (const userData of users) {
      const user = new User(userData);
      await user.save();
      console.log(`   ✅ Created user: ${user.email} (${user.role})`);
    }

    console.log("\n🎉 Database seeded successfully!");
    console.log("\n📋 Login credentials:");
    console.log("   Admin: admin@bookshop.com / admin123");
    console.log("   User: user@bookshop.com / user123");
    console.log("\n📝 Note: No books or categories seeded.");
    console.log("   Please add categories and books via Admin Dashboard.\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seed error:", error);
    process.exit(1);
  }
}

seed();
