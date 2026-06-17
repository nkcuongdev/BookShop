const express = require("express");
const Cart = require("../models/Cart");
const Book = require("../models/Book");
const Promotion = require("../models/Promotion");
const { auth } = require("../middleware/auth");

const router = express.Router();

router.use(auth);

const getBookId = (item) => String(item.book?._id || item.book || item.bookId || "");

async function serializeCart(cart) {
  await cart.populate("items.book");
  const books = cart.items.map((item) => item.book).filter(Boolean);
  const decorated = await Promotion.decorateBooks(books);
  const decoratedById = new Map(decorated.map((book) => [String(book._id || book.id), book]));

  const items = cart.items
    .filter((item) => item.book && item.book.status === "active" && Number(item.book.stock) > 0)
    .map((item) => {
      const bookId = String(item.book._id);
      const book = decoratedById.get(bookId) || item.book;
      const stock = Number(book.stock) || 0;
      return {
        book,
        quantity: Math.max(1, Math.min(item.quantity, stock)),
        addedAt: item.addedAt,
      };
    })
    .filter((item) => item.quantity > 0);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + Number(item.book.price || 0) * item.quantity,
    0
  );

  return {
    _id: cart._id,
    id: cart._id,
    items,
    totalItems,
    totalPrice,
    updatedAt: cart.updatedAt,
  };
}

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
}

async function saveNormalized(cart) {
  const merged = new Map();
  for (const item of cart.items || []) {
    const key = getBookId(item);
    if (!key) continue;
    const prev = merged.get(key);
    const qty = Math.max(1, Number(item.quantity) || 1);
    if (prev) prev.quantity += qty;
    else merged.set(key, { book: key, quantity: qty, addedAt: item.addedAt || new Date() });
  }

  const books = await Book.find({
    _id: { $in: Array.from(merged.keys()) },
    status: "active",
    stock: { $gt: 0 },
  });
  const valid = new Set(books.map((book) => String(book._id)));
  cart.items = Array.from(merged.values())
    .filter((item) => valid.has(String(item.book)))
    .map((item) => {
      const book = books.find((b) => String(b._id) === String(item.book));
      const stock = Number(book?.stock) || 0;
      return {
        book: item.book,
        quantity: Math.max(1, Math.min(item.quantity, stock)),
        addedAt: item.addedAt,
      };
    });
  await cart.save();
  return cart;
}

router.get("/", async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user._id);
    res.json({ success: true, data: { cart: await serializeCart(cart) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/items", async (req, res) => {
  try {
    const { bookId, quantity = 1 } = req.body || {};
    const book = await Book.findOne({ _id: bookId, status: "active" });
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });
    if (book.stock <= 0) {
      return res.status(400).json({ success: false, message: "Book is out of stock" });
    }

    const cart = await getOrCreateCart(req.user._id);
    const existing = cart.items.find((item) => String(item.book) === String(book._id));
    const qty = Math.max(1, Number(quantity) || 1);
    if (existing) existing.quantity = Math.min(existing.quantity + qty, book.stock);
    else cart.items.push({ book: book._id, quantity: Math.min(qty, book.stock) });
    await saveNormalized(cart);
    res.json({ success: true, data: { cart: await serializeCart(cart) } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.patch("/items/:bookId", async (req, res) => {
  try {
    const quantity = Math.floor(Number(req.body?.quantity) || 0);
    const cart = await getOrCreateCart(req.user._id);
    if (quantity <= 0) {
      cart.items = cart.items.filter((item) => String(item.book) !== String(req.params.bookId));
    } else {
      const book = await Book.findOne({ _id: req.params.bookId, status: "active", stock: { $gt: 0 } });
      if (!book) return res.status(404).json({ success: false, message: "Book not found" });
      const existing = cart.items.find((item) => String(item.book) === String(book._id));
      if (existing) existing.quantity = Math.min(quantity, book.stock);
      else cart.items.push({ book: book._id, quantity: Math.min(quantity, book.stock) });
    }
    await saveNormalized(cart);
    res.json({ success: true, data: { cart: await serializeCart(cart) } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete("/items/:bookId", async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user._id);
    cart.items = cart.items.filter((item) => String(item.book) !== String(req.params.bookId));
    await cart.save();
    res.json({ success: true, data: { cart: await serializeCart(cart) } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete("/", async (req, res) => {
  try {
    const cart = await getOrCreateCart(req.user._id);
    cart.items = [];
    await cart.save();
    res.json({ success: true, data: { cart: await serializeCart(cart) } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/merge", async (req, res) => {
  try {
    const incoming = Array.isArray(req.body?.items) ? req.body.items.slice(0, 100) : [];
    const cart = await getOrCreateCart(req.user._id);
    for (const item of incoming) {
      const bookId = item.bookId || item.book?._id || item.book?.id;
      const qty = Math.max(1, Number(item.quantity) || 1);
      if (!bookId) continue;
      const existing = cart.items.find((x) => String(x.book) === String(bookId));
      if (existing) existing.quantity += qty;
      else cart.items.push({ book: bookId, quantity: qty });
    }
    await saveNormalized(cart);
    res.json({ success: true, data: { cart: await serializeCart(cart) } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
