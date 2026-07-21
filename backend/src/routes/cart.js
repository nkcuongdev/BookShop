const express = require("express");
const mongoose = require("mongoose");
const Cart = require("../models/Cart");
const Book = require("../models/Book");
const Promotion = require("../models/Promotion");
const { auth } = require("../middleware/auth");
const { toPublicBooks } = require("../serializers/bookSerializer");

const router = express.Router();
const MAX_CART_ITEMS = 100;
const MAX_ITEM_QUANTITY = 99;
const MAX_MUTATION_RETRIES = 5;

router.use(auth);

const getBookId = (item) => String(item.book?._id || item.book || item.bookId || "");

async function serializeCart(cart, unavailableItems = [], adjustedItems = []) {
  const rawItems = (cart.items || []).map((item) => ({
    bookId: getBookId(item) || String(item.snapshot?.bookId || ""),
    quantity: item.quantity,
    addedAt: item.addedAt,
    snapshot: item.snapshot?.toObject ? item.snapshot.toObject() : item.snapshot || {},
  }));
  await cart.populate("items.book");
  const books = cart.items.map((item) => item.book).filter(Boolean);
  const decorated = toPublicBooks(await Promotion.decorateBooks(books));
  const decoratedById = new Map(decorated.map((book) => [String(book._id || book.id), book]));

  const unavailableById = new Map(
    unavailableItems.map((item) => [String(item.bookId), item])
  );
  const adjustedById = new Map(
    adjustedItems.map((item) => [String(item.bookId), item])
  );
  const items = rawItems
    .map((raw, index) => {
      const populated = cart.items[index]?.book || null;
      const bookId = raw.bookId || String(populated?._id || "");
      const liveBook = populated
        ? decoratedById.get(bookId) || populated.toObject?.() || populated
        : null;
      const book = liveBook || {
        _id: bookId,
        id: bookId,
        ...raw.snapshot,
        stock: 0,
        status: "unavailable",
      };
      const unavailable = unavailableById.get(bookId) || null;
      const adjustment = adjustedById.get(bookId) || null;
      return {
        book,
        quantity: raw.quantity,
        addedAt: raw.addedAt,
        available: !unavailable,
        unavailableReason: unavailable?.reason || "",
        adjustment,
      };
    })
    .filter((item) => item.quantity > 0);

  const purchasableItems = items.filter((item) => item.available);
  const totalItems = purchasableItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) =>
      sum + (item.available ? Number(item.book.price || 0) * item.quantity : 0),
    0
  );

  return {
    _id: cart._id,
    id: cart._id,
    items,
    totalItems,
    totalPrice,
    unavailableItems,
    adjustedItems,
    updatedAt: cart.updatedAt,
  };
}

async function getOrCreateCart(userId) {
  return Cart.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, items: [] } },
    { upsert: true, returnDocument: "after", runValidators: true }
  );
}

function parseQuantity(value, { allowZero = false } = {}) {
  const quantity = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (
    !Number.isInteger(quantity) ||
    quantity < minimum ||
    quantity > MAX_ITEM_QUANTITY
  ) {
    const error = new Error("Invalid cart quantity");
    error.status = 400;
    throw error;
  }
  return quantity;
}

async function normalizeCartDocument(cart) {
  const merged = new Map();
  for (const item of cart.items || []) {
    const key = getBookId(item);
    if (!key) continue;
    const prev = merged.get(key);
    const qty = Math.min(MAX_ITEM_QUANTITY, Math.max(1, Number(item.quantity) || 1));
    if (prev) prev.quantity = Math.min(MAX_ITEM_QUANTITY, prev.quantity + qty);
    else merged.set(key, {
      book: key,
      quantity: qty,
      addedAt: item.addedAt || new Date(),
      snapshot: item.snapshot?.toObject ? item.snapshot.toObject() : item.snapshot || {},
    });
  }

  const books = await Book.find({ _id: { $in: Array.from(merged.keys()) } })
    .select("_id title author imageUrl price status stock")
    .lean();
  const booksById = new Map(books.map((book) => [String(book._id), book]));
  const unavailableItems = [];
  const adjustedItems = [];
  const normalizedItems = [];

  for (const item of merged.values()) {
    const book = booksById.get(String(item.book));
    let reason = "";
    if (!book) reason = "not_found";
    else if (book.status !== "active") reason = "inactive";
    else if (Number(book.stock) <= 0) reason = "out_of_stock";

    if (reason) {
      unavailableItems.push({ bookId: String(item.book), reason });
      normalizedItems.push({
        ...item,
        snapshot: book
          ? {
              bookId: String(book._id),
              title: book.title,
              author: book.author,
              imageUrl: book.imageUrl,
              price: book.price,
            }
          : item.snapshot,
      });
      continue;
    }

    const quantity = Math.min(
      item.quantity,
      Math.max(0, Math.floor(Number(book.stock) || 0)),
      MAX_ITEM_QUANTITY
    );
    if (quantity <= 0) {
      unavailableItems.push({ bookId: String(item.book), reason: "out_of_stock" });
      continue;
    }
    if (quantity !== item.quantity) {
      adjustedItems.push({
        bookId: String(item.book),
        reason: "stock_reduced",
        requestedQuantity: item.quantity,
        availableQuantity: quantity,
      });
    }
    normalizedItems.push({
      ...item,
      quantity,
      snapshot: {
        bookId: String(book._id),
        title: book.title,
        author: book.author,
        imageUrl: book.imageUrl,
        price: book.price,
      },
    });
  }

  const boundedItems = normalizedItems.slice(0, MAX_CART_ITEMS);
  const before = (cart.items || []).map((item) => [
    getBookId(item),
    Number(item.quantity),
    item.snapshot?.toObject ? item.snapshot.toObject() : item.snapshot || {},
  ]);
  const after = boundedItems.map((item) => [
    String(item.book),
    item.quantity,
    item.snapshot || {},
  ]);
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  if (changed) cart.items = boundedItems;

  return { changed, unavailableItems, adjustedItems };
}

async function mutateCartWithRetry(userId, mutate = null) {
  for (let attempt = 0; attempt < MAX_MUTATION_RETRIES; attempt += 1) {
    const cart = await getOrCreateCart(userId);
    const beforeMutation = await normalizeCartDocument(cart);
    const mutationChanged = mutate ? (await mutate(cart)) !== false : false;
    const afterMutation = mutationChanged
      ? await normalizeCartDocument(cart)
      : { changed: false, unavailableItems: [], adjustedItems: [] };
    const changed = beforeMutation.changed || mutationChanged || afterMutation.changed;

    try {
      if (changed) await cart.save();
      return {
        cart,
        unavailableItems: [
          ...beforeMutation.unavailableItems,
          ...afterMutation.unavailableItems,
        ],
        adjustedItems: [
          ...beforeMutation.adjustedItems,
          ...afterMutation.adjustedItems,
        ],
      };
    } catch (error) {
      if (!(error instanceof mongoose.Error.VersionError)) throw error;
      if (attempt === MAX_MUTATION_RETRIES - 1) {
        error.status = 409;
        error.message = "Cart changed concurrently; please retry";
        throw error;
      }
    }
  }
  throw new Error("Unable to update cart");
}

router.get("/", async (req, res, next) => {
  try {
    const result = await mutateCartWithRetry(req.user._id);
    res.json({
      success: true,
      data: {
        cart: await serializeCart(
          result.cart,
          result.unavailableItems,
          result.adjustedItems
        ),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/items", async (req, res, next) => {
  try {
    const { bookId, quantity = 1 } = req.body || {};
    if (!mongoose.isValidObjectId(bookId)) {
      return res.status(400).json({ success: false, message: "Invalid book ID" });
    }
    const qty = parseQuantity(quantity);
    const book = await Book.findOne({ _id: bookId, status: "active" });
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });
    if (book.stock <= 0) {
      return res.status(400).json({ success: false, message: "Book is out of stock" });
    }

    const result = await mutateCartWithRetry(req.user._id, (cart) => {
      const existing = cart.items.find(
        (item) => String(item.book) === String(book._id)
      );
      if (!existing && cart.items.length >= MAX_CART_ITEMS) {
        const error = new Error("Cart item limit reached");
        error.status = 400;
        throw error;
      }
      if (existing) {
        existing.quantity = Math.min(
          existing.quantity + qty,
          Number(book.stock),
          MAX_ITEM_QUANTITY
        );
      } else {
        cart.items.push({
          book: book._id,
          quantity: Math.min(qty, Number(book.stock), MAX_ITEM_QUANTITY),
          snapshot: {
            bookId: String(book._id),
            title: book.title,
            author: book.author,
            imageUrl: book.imageUrl,
            price: book.price,
          },
        });
      }
      return true;
    });
    res.json({
      success: true,
      data: {
        cart: await serializeCart(
          result.cart,
          result.unavailableItems,
          result.adjustedItems
        ),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/items/:bookId", async (req, res, next) => {
  try {
    const quantity = parseQuantity(req.body?.quantity, { allowZero: true });
    if (!mongoose.isValidObjectId(req.params.bookId)) {
      return res.status(400).json({ success: false, message: "Invalid book ID" });
    }
    const book =
      quantity > 0
        ? await Book.findOne({
            _id: req.params.bookId,
            status: "active",
            stock: { $gt: 0 },
          })
        : null;
    if (quantity > 0 && !book) {
      return res.status(404).json({ success: false, message: "Book not found" });
    }
    const result = await mutateCartWithRetry(req.user._id, (cart) => {
      const existing = cart.items.find(
        (item) => String(item.book) === String(req.params.bookId)
      );
      if (quantity <= 0) {
        if (!existing) return false;
        cart.items = cart.items.filter(
          (item) => String(item.book) !== String(req.params.bookId)
        );
        return true;
      }
      const nextQuantity = Math.min(
        quantity,
        Number(book.stock),
        MAX_ITEM_QUANTITY
      );
      if (existing) existing.quantity = nextQuantity;
      else cart.items.push({
        book: book._id,
        quantity: nextQuantity,
        snapshot: {
          bookId: String(book._id),
          title: book.title,
          author: book.author,
          imageUrl: book.imageUrl,
          price: book.price,
        },
      });
      return true;
    });
    res.json({
      success: true,
      data: {
        cart: await serializeCart(
          result.cart,
          result.unavailableItems,
          result.adjustedItems
        ),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/items/:bookId", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.bookId)) {
      return res.status(400).json({ success: false, message: "Invalid book ID" });
    }
    const result = await mutateCartWithRetry(req.user._id, (cart) => {
      const nextItems = cart.items.filter(
        (item) => String(item.book) !== String(req.params.bookId)
      );
      if (nextItems.length === cart.items.length) return false;
      cart.items = nextItems;
      return true;
    });
    res.json({ success: true, data: { cart: await serializeCart(result.cart) } });
  } catch (error) {
    next(error);
  }
});

router.delete("/", async (req, res, next) => {
  try {
    const result = await mutateCartWithRetry(req.user._id, (cart) => {
      if (!cart.items.length) return false;
      cart.items = [];
      return true;
    });
    res.json({ success: true, data: { cart: await serializeCart(result.cart) } });
  } catch (error) {
    next(error);
  }
});

router.post("/merge", async (req, res, next) => {
  try {
    if (!Array.isArray(req.body?.items) || req.body.items.length > MAX_CART_ITEMS) {
      return res.status(400).json({ success: false, message: "Invalid cart items" });
    }
    const incoming = req.body.items.map((item) => {
      const bookId = item.bookId || item.book?._id || item.book?.id;
      if (!mongoose.isValidObjectId(bookId)) {
        const error = new Error("Invalid book ID");
        error.status = 400;
        throw error;
      }
      return { bookId: String(bookId), quantity: parseQuantity(item.quantity) };
    });
    const result = await mutateCartWithRetry(req.user._id, (cart) => {
      for (const item of incoming) {
        const existing = cart.items.find(
          (entry) => String(entry.book) === item.bookId
        );
        // max() makes guest-to-account merge idempotent across retries/tabs.
        if (existing) existing.quantity = Math.max(existing.quantity, item.quantity);
        else cart.items.push({ book: item.bookId, quantity: item.quantity });
      }
      if (cart.items.length > MAX_CART_ITEMS) {
        const error = new Error("Cart item limit reached");
        error.status = 400;
        throw error;
      }
      return incoming.length > 0;
    });
    res.json({
      success: true,
      data: {
        cart: await serializeCart(
          result.cart,
          result.unavailableItems,
          result.adjustedItems
        ),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
