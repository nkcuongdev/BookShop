const express = require("express");
const Order = require("../models/Order");
const Book = require("../models/Book");
const { auth } = require("../middleware/auth");

const router = express.Router();

// POST /api/orders - Create order
router.post("/", auth, async (req, res) => {
  try {
    const { items, shippingAddress, note } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng thêm sản phẩm vào đơn hàng",
      });
    }

    if (
      !shippingAddress ||
      !shippingAddress.fullName ||
      !shippingAddress.phone ||
      !shippingAddress.address
    ) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ thông tin giao hàng",
      });
    }

    // Validate items and calculate total
    const orderItems = [];
    let totalAmount = 0;

    for (const item of items) {
      const book = await Book.findById(item.bookId);
      if (!book) {
        return res.status(400).json({
          success: false,
          message: `Không tìm thấy sách: ${item.bookId}`,
        });
      }
      if (book.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Không đủ hàng: ${book.title}. Còn lại: ${book.stock}`,
        });
      }

      orderItems.push({
        book: book._id,
        bookId: book._id.toString(),
        title: book.title,
        price: book.price,
        quantity: item.quantity,
      });
      totalAmount += book.price * item.quantity;

      // Update book stock and sold
      await Book.updateSold(book._id, item.quantity);
    }

    // Create order
    const order = new Order({
      user: req.user._id,
      items: orderItems,
      totalAmount,
      shippingAddress,
      note: note || "",
    });
    await order.save();

    res.status(201).json({
      success: true,
      message: "Đặt hàng thành công",
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// GET /api/orders - Get current user's orders
router.get("/", auth, async (req, res) => {
  try {
    const orders = await Order.getByUser(req.user._id);

    res.json({
      success: true,
      data: {
        orders: orders.map((o) => ({ ...o.toObject(), id: o._id })),
        count: orders.length,
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

// GET /api/orders/:id - Get single order
router.get("/:id", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "user",
      "name email"
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    // Check ownership or admin
    if (
      order.user._id.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Không có quyền truy cập",
      });
    }

    res.json({
      success: true,
      data: { order: { ...order.toObject(), id: order._id } },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi server",
      error: error.message,
    });
  }
});

module.exports = router;
