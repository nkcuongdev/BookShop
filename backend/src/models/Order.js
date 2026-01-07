const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    bookId: { type: String }, // Keep for backward compatibility
    title: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "shipped",
        "delivered",
        "completed",
        "cancelled",
      ],
      default: "pending",
    },
    shippingAddress: shippingAddressSchema,
    paymentMethod: { type: String, default: "cod" },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

// Static: Get user orders
orderSchema.statics.getByUser = function (userId) {
  return this.find({ user: userId }).sort({ createdAt: -1 });
};

// Static: Get all orders with pagination
orderSchema.statics.getAllWithPagination = async function (options = {}) {
  const page = parseInt(options.page) || 1;
  const limit = parseInt(options.limit) || 10;
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    this.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    this.countDocuments(),
  ]);

  return { orders, total, page, totalPages: Math.ceil(total / limit) };
};

// Static: Get statistics
orderSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: "$totalAmount" },
        avgOrderValue: { $avg: "$totalAmount" },
      },
    },
  ]);

  const statusCounts = await this.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  return {
    totalOrders: stats[0]?.totalOrders || 0,
    totalRevenue: stats[0]?.totalRevenue || 0,
    avgOrderValue: stats[0]?.avgOrderValue || 0,
    statusCounts: statusCounts.reduce(
      (acc, s) => ({ ...acc, [s._id]: s.count }),
      {}
    ),
  };
};

// Check if user purchased book
orderSchema.statics.hasUserPurchasedBook = async function (userId, bookId) {
  const order = await this.findOne({
    user: userId,
    status: { $in: ["completed", "delivered"] },
    "items.book": bookId,
  });
  return !!order;
};

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
