const Book = require("../models/Book");
const inventoryService = require("./inventoryService");

// Order-flow adapter over inventoryService. Every stock change in the system
// must go through inventoryService.applyMovement so the ledger stays complete;
// these helpers keep the call sites in orderService unchanged while routing the
// movement through it with the right movement type and order reference.
//
// `sold` is a sales metric rather than a stock quantity, so it is still updated
// directly here and is deliberately absent from the ledger.

function optionsFor(session) {
  return session ? { session } : undefined;
}

function contextFrom(context = {}) {
  return {
    refType: "Order",
    refId: context.orderId || null,
    refCode: context.orderCode || "",
    reason: context.reason || "",
    performedBy: context.performedBy || null,
  };
}

/**
 * Commit stock to a customer order. Returns false when there is not enough on
 * hand, matching the previous contract so the order flow can roll back.
 */
async function decrementStock(bookId, quantity, session = null, context = {}) {
  try {
    await inventoryService.applyMovement(
      {
        bookId,
        type: "SALE_OUT",
        quantity,
        ...contextFrom(context),
      },
      session
    );
    return true;
  } catch (error) {
    if (
      error.code === "INSUFFICIENT_STOCK" ||
      error.code === "BOOK_NOT_FOUND"
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * Put stock back. `type` distinguishes a released reservation (RESERVE_IN,
 * which also clears Book.reserved) from goods physically coming back from a
 * customer (RETURN_IN, which adds to the shelf).
 */
async function incrementStock(
  bookId,
  quantity,
  session = null,
  context = {},
  type = "RESERVE_IN"
) {
  await inventoryService.applyMovement(
    {
      bookId,
      type,
      quantity,
      ...contextFrom(context),
    },
    session
  );
}

/**
 * Hand the reserved copies to the carrier. `stock` already lost them when the
 * order was placed, so this only clears the reservation and drops onHand: the
 * goods have physically left the warehouse and a stocktake must stop expecting
 * to find them.
 */
async function dispatchItems(items, session = null, context = {}) {
  for (const item of items) {
    await inventoryService.applyMovement(
      {
        bookId: item.book,
        type: "SHIP_OUT",
        quantity: item.quantity,
        ...contextFrom(context),
      },
      session
    );
  }
}

async function incrementSold(bookId, quantity, session = null) {
  return Book.updateOne(
    { _id: bookId },
    { $inc: { sold: quantity } },
    optionsFor(session)
  );
}

async function decrementSold(bookId, quantity, session = null) {
  return Book.updateOne(
    { _id: bookId, sold: { $gte: quantity } },
    { $inc: { sold: -quantity } },
    optionsFor(session)
  );
}

/**
 * Restore every line of an order. MongoDB sessions do not support parallel
 * operations inside a transaction, so this stays sequential.
 */
async function restoreItems(items, session = null, context = {}, type = "RESERVE_IN") {
  for (const item of items) {
    await incrementStock(item.book, item.quantity, session, context, type);
  }
}

module.exports = {
  decrementSold,
  decrementStock,
  dispatchItems,
  incrementSold,
  incrementStock,
  restoreItems,
};
