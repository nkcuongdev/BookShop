process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const User = require("../src/models/User");
const Order = require("../src/models/Order");
const Book = require("../src/models/Book");
const Voucher = require("../src/models/Voucher");
const LoyaltyLedger = require("../src/models/LoyaltyLedger");
const LoyaltyProgram = require("../src/models/LoyaltyProgram");
const LoyaltyGift = require("../src/models/LoyaltyGift");
const LoyaltyGiftRedemption = require("../src/models/LoyaltyGiftRedemption");
const loyaltyService = require("../src/services/loyaltyService");
const { runInTransaction } = require("../src/utils/transaction");

let replicaSet;
let customerId;

const PASSWORD = "Test1234!";

before(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replicaSet.getUri());
  await Promise.all([
    LoyaltyLedger.syncIndexes(),
    LoyaltyGift.syncIndexes(),
    LoyaltyGiftRedemption.syncIndexes(),
    LoyaltyProgram.syncIndexes(),
    Voucher.syncIndexes(),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  await replicaSet?.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Order.deleteMany({}),
    Book.deleteMany({}),
    Voucher.deleteMany({}),
    LoyaltyGift.deleteMany({}),
    LoyaltyGiftRedemption.deleteMany({}),
    LoyaltyProgram.deleteMany({}),
    LoyaltyLedger.collection.deleteMany({}),
  ]);
  LoyaltyProgram.invalidateCache();

  const customer = await User.create({
    name: "Khách Test",
    email: "khach@test.com",
    password: PASSWORD,
    emailVerifiedAt: new Date(),
  });
  customerId = customer._id;
});

/** Give a customer a starting balance through the ledger, as production does. */
async function grantPoints(userId, points, reason = "Điểm khởi tạo cho test") {
  return loyaltyService.adjustPoints({
    userId,
    points,
    reason,
    performedBy: null,
  });
}

const SHIPPING_ADDRESS = {
  fullName: "Khách Test",
  phone: "0912345678",
  address: "123 Đường Test, Phường 1",
  city: "Hồ Chí Minh",
};

function orderItemFixture() {
  return {
    book: new mongoose.Types.ObjectId(),
    title: "Sách test",
    price: 500_000,
    quantity: 1,
    subtotal: 500_000,
  };
}

function orderFixture(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    orderCode: Order.generateOrderCode(),
    user: customerId,
    shippingAddress: SHIPPING_ADDRESS,
    items: [orderItemFixture()],
    subtotal: 500_000,
    discountAmount: 0,
    shippingDiscountAmount: 0,
    shippingFee: 25_000,
    totalAmount: 525_000,
    status: Order.STATUS.DELIVERED,
    deliveredAt: new Date(),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────
// applyPointsMovement: the balance guard
// ──────────────────────────────────────────────────────────────

test("a movement writes the ledger and the balance together", async () => {
  await grantPoints(customerId, 100);

  const user = await User.findById(customerId).lean();
  assert.equal(user.loyalty.pointsBalance, 100);
  assert.equal(user.loyalty.lifetimeEarned, 100);

  const entries = await LoyaltyLedger.find({ user: customerId }).lean();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, "ADJUST");
  assert.equal(entries[0].points, 100);
  assert.equal(entries[0].balanceBefore, 0);
  assert.equal(entries[0].balanceAfter, 100);
});

test("spending more than the balance is refused and writes nothing", async () => {
  await grantPoints(customerId, 50);

  await assert.rejects(
    () =>
      runInTransaction((session) =>
        loyaltyService.applyPointsMovement(
          {
            userId: customerId,
            type: "REDEEM_ORDER",
            points: -80,
            refType: "Order",
            refId: new mongoose.Types.ObjectId(),
            uniqueKey: `REDEEM_ORDER:Order:${new mongoose.Types.ObjectId()}`,
          },
          session
        )
      ),
    (error) => error.code === "INSUFFICIENT_POINTS"
  );

  const user = await User.findById(customerId).lean();
  assert.equal(user.loyalty.pointsBalance, 50);
  assert.equal(await LoyaltyLedger.countDocuments({ type: "REDEEM_ORDER" }), 0);
});

test("an adjustment without a reason is refused", async () => {
  await assert.rejects(
    () => grantPoints(customerId, 10, "   "),
    (error) => error.code === "REASON_REQUIRED"
  );
});

test("the ledger refuses updates and deletes through Mongoose", async () => {
  await grantPoints(customerId, 10);
  await assert.rejects(
    () => LoyaltyLedger.updateOne({}, { $set: { points: 9999 } }),
    /immutable/
  );
  await assert.rejects(() => LoyaltyLedger.deleteMany({}), /immutable/);
});

// ──────────────────────────────────────────────────────────────
// Kịch bản I — concurrency
// ──────────────────────────────────────────────────────────────

test("two concurrent redemptions cannot both spend the same balance", async () => {
  // Balance 100, two simultaneous attempts to spend 80. Exactly one may win:
  // the guard lives in the update filter, so there is no read-then-write
  // window for the second to slip through.
  await grantPoints(customerId, 100);

  const attempt = (orderId) =>
    runInTransaction((session) =>
      loyaltyService.applyPointsMovement(
        {
          userId: customerId,
          type: "REDEEM_ORDER",
          points: -80,
          refType: "Order",
          refId: orderId,
          refCode: "OD-RACE",
          uniqueKey: `REDEEM_ORDER:Order:${orderId}`,
        },
        session
      )
    );

  const results = await Promise.allSettled([
    attempt(new mongoose.Types.ObjectId()),
    attempt(new mongoose.Types.ObjectId()),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "exactly one redemption should succeed");
  assert.equal(rejected.length, 1);

  const user = await User.findById(customerId).lean();
  assert.equal(user.loyalty.pointsBalance, 20);
  assert.equal(await LoyaltyLedger.countDocuments({ type: "REDEEM_ORDER" }), 1);
});

test("the uniqueKey stops the same movement being recorded twice", async () => {
  await grantPoints(customerId, 200);
  const orderId = new mongoose.Types.ObjectId();

  const record = () =>
    runInTransaction((session) =>
      loyaltyService.applyPointsMovement(
        {
          userId: customerId,
          type: "REDEEM_ORDER",
          points: -50,
          refType: "Order",
          refId: orderId,
          uniqueKey: `REDEEM_ORDER:Order:${orderId}`,
        },
        session
      )
    );

  await record();
  await assert.rejects(record, (error) => error.code === "DUPLICATE_MOVEMENT");

  const user = await User.findById(customerId).lean();
  // The duplicate rolled back, so only the first deduction stands.
  assert.equal(user.loyalty.pointsBalance, 150);
  assert.equal(await LoyaltyLedger.countDocuments({ type: "REDEEM_ORDER" }), 1);
});

test("a movement carrying a uniqueKey refuses to run outside a transaction", async () => {
  await assert.rejects(
    () =>
      loyaltyService.applyPointsMovement({
        userId: customerId,
        type: "EARN",
        points: 10,
        uniqueKey: "EARN:Order:whatever",
      }),
    (error) => error.code === "SESSION_REQUIRED"
  );
});

// ──────────────────────────────────────────────────────────────
// Earning
// ──────────────────────────────────────────────────────────────

test("earning excludes shipping and follows the tier multiplier", async () => {
  const order = new Order(orderFixture());

  await runInTransaction((session) =>
    loyaltyService.earnForOrder(order, session)
  );

  // 500.000 goods at 10.000/point, base tier: 50 points. The 25.000 delivery
  // fee earns nothing.
  assert.equal(order.pointsEarned, 50);
  assert.ok(order.pointsEarnedAt);

  const user = await User.findById(customerId).lean();
  assert.equal(user.loyalty.pointsBalance, 50);

  const entry = await LoyaltyLedger.findOne({ type: "EARN" }).lean();
  assert.equal(entry.earnBasis.eligibleAmount, 500_000);
  assert.equal(entry.earnBasis.baseRate, 10_000);
  assert.equal(entry.earnBasis.tierMultiplier, 1);
});

test("a gold customer earns the multiplied amount", async () => {
  await User.updateOne(
    { _id: customerId },
    { $set: { "loyalty.tierKey": "gold" } }
  );

  const order = new Order(orderFixture());
  await runInTransaction((session) =>
    loyaltyService.earnForOrder(order, session)
  );

  // 500.000 / 10.000 = 50, times the gold multiplier of 1.2.
  assert.equal(order.pointsEarned, 60);
});

test("earning is idempotent and never doubles up", async () => {
  const order = new Order(orderFixture());

  await runInTransaction((session) =>
    loyaltyService.earnForOrder(order, session)
  );
  const second = await runInTransaction((session) =>
    loyaltyService.earnForOrder(order, session)
  );

  assert.equal(second, null, "a second call should be a no-op");
  assert.equal(await LoyaltyLedger.countDocuments({ type: "EARN" }), 1);

  const user = await User.findById(customerId).lean();
  assert.equal(user.loyalty.pointsBalance, 50);
});

test("the uniqueKey still blocks a double earn when the flag is lost", async () => {
  // Simulates the exact failure the plan warns about: a call site that forgets
  // to select pointsEarnedAt, leaving the cheap guard blind.
  const order = new Order(orderFixture());
  await runInTransaction((session) =>
    loyaltyService.earnForOrder(order, session)
  );

  order.pointsEarnedAt = null;
  await assert.rejects(
    () =>
      runInTransaction((session) =>
        loyaltyService.earnForOrder(order, session)
      ),
    (error) => error.code === "DUPLICATE_MOVEMENT"
  );

  assert.equal(await LoyaltyLedger.countDocuments({ type: "EARN" }), 1);
});

test("an order paid entirely with vouchers and points earns nothing", async () => {
  const order = new Order(
    orderFixture({
      subtotal: 100_000,
      discountAmount: 100_000,
      pointsDiscountAmount: 0,
    })
  );

  await runInTransaction((session) =>
    loyaltyService.earnForOrder(order, session)
  );

  assert.equal(order.pointsEarned, 0);
  // Still marked, so the order is not reconsidered on every pass.
  assert.ok(order.pointsEarnedAt);
  assert.equal(await LoyaltyLedger.countDocuments({ type: "EARN" }), 0);
});

test("points spent on an order do not earn points back", async () => {
  const order = new Order(
    orderFixture({ subtotal: 500_000, pointsDiscountAmount: 100_000 })
  );

  await runInTransaction((session) =>
    loyaltyService.earnForOrder(order, session)
  );

  // 500.000 - 100.000 paid with points = 400.000 earning base.
  assert.equal(order.pointsEarned, 40);
});

// ──────────────────────────────────────────────────────────────
// Spending at checkout
// ──────────────────────────────────────────────────────────────

test("redeeming enforces the cap, the step and the minimum", async () => {
  await grantPoints(customerId, 500);
  const orderId = new mongoose.Types.ObjectId();

  // 30% of 300.000 = 90.000đ = 90 points. 100 points is over the ceiling.
  await assert.rejects(
    () =>
      runInTransaction((session) =>
        loyaltyService.redeemForOrder(
          {
            userId: customerId,
            requestedPoints: 100,
            eligibleAmount: 300_000,
            orderId,
            orderCode: "OD-CAP",
          },
          session
        )
      ),
    (error) => error.code === "REDEEM_CAP_EXCEEDED"
  );

  await assert.rejects(
    () =>
      runInTransaction((session) =>
        loyaltyService.redeemForOrder(
          {
            userId: customerId,
            // Above redeemMinPoints so the step rule is what rejects it,
            // not the minimum.
            requestedPoints: 15,
            eligibleAmount: 300_000,
            orderId,
            orderCode: "OD-STEP",
          },
          session
        )
      ),
    (error) => error.code === "INVALID_POINTS_STEP"
  );

  await assert.rejects(
    () =>
      runInTransaction((session) =>
        loyaltyService.redeemForOrder(
          {
            userId: customerId,
            requestedPoints: 5,
            eligibleAmount: 300_000,
            orderId,
            orderCode: "OD-MIN",
          },
          session
        )
      ),
    (error) => error.code === "BELOW_MIN_POINTS"
  );

  const user = await User.findById(customerId).lean();
  assert.equal(user.loyalty.pointsBalance, 500, "no rejection may move the balance");
});

test("a valid redemption returns the discount and deducts the points", async () => {
  await grantPoints(customerId, 500);
  const orderId = new mongoose.Types.ObjectId();

  const result = await runInTransaction((session) =>
    loyaltyService.redeemForOrder(
      {
        userId: customerId,
        requestedPoints: 90,
        eligibleAmount: 300_000,
        orderId,
        orderCode: "OD-OK",
      },
      session
    )
  );

  assert.equal(result.points, 90);
  assert.equal(result.discountAmount, 90_000);
  assert.equal(result.rate, 1_000);

  const user = await User.findById(customerId).lean();
  assert.equal(user.loyalty.pointsBalance, 410);
  assert.equal(user.loyalty.lifetimeRedeemed, 90);
});

test("the cap follows the amount left after an order voucher", async () => {
  await grantPoints(customerId, 500);

  // A voucher halving the goods total halves the points allowance with it,
  // which is the whole point of measuring the cap post-voucher.
  await assert.rejects(
    () =>
      runInTransaction((session) =>
        loyaltyService.redeemForOrder(
          {
            userId: customerId,
            requestedPoints: 90,
            eligibleAmount: 150_000, // 500.000 goods less a 350.000 voucher
            orderId: new mongoose.Types.ObjectId(),
            orderCode: "OD-VOUCHER",
          },
          session
        )
      ),
    (error) => error.code === "REDEEM_CAP_EXCEEDED"
  );
});

// ──────────────────────────────────────────────────────────────
// Refund and revoke
// ──────────────────────────────────────────────────────────────

test("cancelling an order hands the spent points back once", async () => {
  await grantPoints(customerId, 200);
  const order = new Order(
    orderFixture({ status: Order.STATUS.PENDING, deliveredAt: null, pointsRedeemed: 50 })
  );

  await runInTransaction((session) =>
    loyaltyService.refundOrderPoints(order, session)
  );
  const second = await runInTransaction((session) =>
    loyaltyService.refundOrderPoints(order, session)
  );

  assert.equal(second, null);
  const user = await User.findById(customerId).lean();
  assert.equal(user.loyalty.pointsBalance, 250);
  assert.equal(await LoyaltyLedger.countDocuments({ type: "REFUND_ORDER" }), 1);
});

test("refunding a delivered order claws the earned points back", async () => {
  const order = new Order(orderFixture());
  await runInTransaction((session) =>
    loyaltyService.earnForOrder(order, session)
  );
  assert.equal(order.pointsEarned, 50);

  await runInTransaction((session) =>
    loyaltyService.revokeOrderPoints(order, session)
  );

  const user = await User.findById(customerId).lean();
  assert.equal(user.loyalty.pointsBalance, 0);

  const entry = await LoyaltyLedger.findOne({ type: "REVOKE" }).lean();
  assert.equal(entry.points, -50);
});

test("a claw-back takes what is left rather than going negative", async () => {
  const order = new Order(orderFixture());
  await runInTransaction((session) =>
    loyaltyService.earnForOrder(order, session)
  );

  // The customer spends most of it before the refund arrives.
  await runInTransaction((session) =>
    loyaltyService.redeemForOrder(
      {
        userId: customerId,
        requestedPoints: 40,
        eligibleAmount: 200_000,
        orderId: new mongoose.Types.ObjectId(),
        orderCode: "OD-SPENT",
      },
      session
    )
  );

  await runInTransaction((session) =>
    loyaltyService.revokeOrderPoints(order, session)
  );

  const user = await User.findById(customerId).lean();
  assert.equal(user.loyalty.pointsBalance, 0, "balance must never go negative");

  const entry = await LoyaltyLedger.findOne({ type: "REVOKE" }).lean();
  assert.equal(entry.points, -10, "only the surviving 10 points come back");
  assert.match(entry.reason, /thiếu 40 điểm/);
});

test("a partial return claws back a proportional share", async () => {
  const order = new Order(orderFixture());
  await runInTransaction((session) =>
    loyaltyService.earnForOrder(order, session)
  );
  assert.equal(order.pointsEarned, 50);

  // A fifth of the goods value comes back, so a fifth of the points do too.
  await runInTransaction((session) =>
    loyaltyService.revokeOrderPointsPartial(
      order,
      {
        refundedGoodsAmount: 100_000,
        returnId: new mongoose.Types.ObjectId(),
        returnCode: "TR000001",
      },
      session
    )
  );

  const user = await User.findById(customerId).lean();
  assert.equal(user.loyalty.pointsBalance, 40);
});

// ──────────────────────────────────────────────────────────────
// Tier evaluation
// ──────────────────────────────────────────────────────────────

test("tier follows spend inside the rolling window, with grace on the way down", async () => {
  const now = new Date();
  const recent = new Date(now.getTime() - 10 * 86_400_000);

  await Order.create(
    orderFixture({
      _id: new mongoose.Types.ObjectId(),
      orderCode: Order.generateOrderCode(),
      subtotal: 6_000_000,
      totalAmount: 6_000_000,
      deliveredAt: recent,
    })
  );

  const promoted = await loyaltyService.recalcTier(customerId, { now });
  assert.equal(promoted.changed, true);
  assert.equal(promoted.to, "gold");
  assert.equal(promoted.spend12m, 6_000_000);

  // Push the order outside the window: the spend drops away.
  await Order.updateOne(
    {},
    { $set: { deliveredAt: new Date(now.getTime() - 400 * 86_400_000) } }
  );

  const graced = await loyaltyService.recalcTier(customerId, { now });
  assert.equal(graced.changed, false, "grace keeps the tier on first drop");
  assert.equal(graced.spend12m, 0);

  const user = await User.findById(customerId).lean();
  assert.ok(user.loyalty.tierValidUntil, "a grace deadline is set");

  // Once the grace period lapses, the demotion stands.
  const later = new Date(now.getTime() + 40 * 86_400_000);
  const demoted = await loyaltyService.recalcTier(customerId, { now: later });
  assert.equal(demoted.changed, true);
  assert.equal(demoted.to, "silver");
});

test("a refunded order stops counting toward the tier", async () => {
  await Order.create(
    orderFixture({
      _id: new mongoose.Types.ObjectId(),
      orderCode: Order.generateOrderCode(),
      subtotal: 6_000_000,
      totalAmount: 6_000_000,
      status: Order.STATUS.REFUNDED,
    })
  );

  const result = await loyaltyService.recalcTier(customerId);
  assert.equal(result.spend12m, 0);
  assert.equal(result.to, "silver");
});

// ──────────────────────────────────────────────────────────────
// Gift catalogue
// ──────────────────────────────────────────────────────────────

async function createGift(overrides = {}) {
  return LoyaltyGift.create({
    code: "GIAM20K",
    name: "Voucher giảm 20.000đ",
    pointsCost: 50,
    voucherTemplate: {
      type: "fixed",
      scope: "order",
      value: 20_000,
      minOrder: 100_000,
      validDays: 30,
    },
    perUserLimit: 1,
    ...overrides,
  });
}

test("redeeming a gift mints a private single-use voucher", async () => {
  await grantPoints(customerId, 100);
  const gift = await createGift();

  const { voucher, redemption } = await loyaltyService.redeemGift({
    userId: customerId,
    giftId: gift._id,
  });

  assert.match(voucher.code, /^GIFT_GIAM20K_[0-9A-F]{8}$/);
  assert.equal(voucher.usageLimit, 1);
  assert.equal(voucher.perUserLimit, 1);
  assert.equal(
    voucher.publicVisible,
    false,
    "a redeemed voucher must not appear in the public list"
  );
  assert.equal(redemption.pointsSpent, 50);

  const user = await User.findById(customerId).lean();
  assert.equal(user.loyalty.pointsBalance, 50);
});

test("a gift beyond the balance leaves no trace", async () => {
  await grantPoints(customerId, 10);
  const gift = await createGift();

  await assert.rejects(
    () => loyaltyService.redeemGift({ userId: customerId, giftId: gift._id }),
    (error) => error.code === "INSUFFICIENT_POINTS"
  );

  // Everything unwinds: no voucher, no redemption, and the claimed stock is
  // released with the transaction.
  assert.equal(await Voucher.countDocuments({}), 0);
  assert.equal(await LoyaltyGiftRedemption.countDocuments({}), 0);
  const after = await LoyaltyGift.findById(gift._id).lean();
  assert.equal(after.issuedCount, 0);
});

test("the per-user limit is enforced", async () => {
  await grantPoints(customerId, 500);
  const gift = await createGift({ perUserLimit: 1 });

  await loyaltyService.redeemGift({ userId: customerId, giftId: gift._id });
  await assert.rejects(
    () => loyaltyService.redeemGift({ userId: customerId, giftId: gift._id }),
    (error) => error.code === "GIFT_USER_LIMIT"
  );
});

test("two concurrent redemptions cannot both claim the last gift", async () => {
  const second = await User.create({
    name: "Khách Hai",
    email: "khach2@test.com",
    password: PASSWORD,
    emailVerifiedAt: new Date(),
  });
  await grantPoints(customerId, 500);
  await grantPoints(second._id, 500);

  const gift = await createGift({ stock: 1, perUserLimit: 5 });

  const results = await Promise.allSettled([
    loyaltyService.redeemGift({ userId: customerId, giftId: gift._id }),
    loyaltyService.redeemGift({ userId: second._id, giftId: gift._id }),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  assert.equal(fulfilled.length, 1, "only one may take the last unit");

  const after = await LoyaltyGift.findById(gift._id).lean();
  assert.equal(after.issuedCount, 1, "the losing claim must be released");
  assert.equal(await Voucher.countDocuments({}), 1);
});

test("a gift gated to a higher tier is refused", async () => {
  await grantPoints(customerId, 500);
  const gift = await createGift({ minTierKey: "diamond" });

  await assert.rejects(
    () => loyaltyService.redeemGift({ userId: customerId, giftId: gift._id }),
    (error) => error.code === "GIFT_TIER_REQUIRED"
  );
});

// ──────────────────────────────────────────────────────────────
// Reconciliation
// ──────────────────────────────────────────────────────────────

test("reconciliation reports a balance that drifts from its ledger", async () => {
  await grantPoints(customerId, 100);
  assert.deepEqual(await loyaltyService.reconcileBalances(), []);

  // Simulate a write that bypassed applyPointsMovement.
  await User.updateOne(
    { _id: customerId },
    { $inc: { "loyalty.pointsBalance": 999 } }
  );

  const drifts = await loyaltyService.reconcileBalances();
  assert.equal(drifts.length, 1);
  assert.equal(drifts[0].drift, 999);
  assert.equal(drifts[0].ledgerTotal, 100);
  assert.equal(drifts[0].balance, 1099);
});

// ──────────────────────────────────────────────────────────────
// Reads
// ──────────────────────────────────────────────────────────────

test("the summary reports the balance, the tier and the next rung", async () => {
  await grantPoints(customerId, 120);
  await User.updateOne(
    { _id: customerId },
    { $set: { "loyalty.tierKey": "silver", "loyalty.spend12m": 2_000_000 } }
  );

  const summary = await loyaltyService.getSummary(customerId);
  assert.equal(summary.balance, 120);
  assert.equal(summary.tier.key, "silver");
  assert.equal(summary.nextTier.key, "gold");
  assert.equal(summary.nextTier.remaining, 3_000_000);
  assert.equal(summary.program.redeemMaxPercent, 30);
});

test("the checkout preview matches what redeeming will accept", async () => {
  await grantPoints(customerId, 500);

  const preview = await loyaltyService.previewRedeem({
    userId: customerId,
    subtotal: 300_000,
    discountAmount: 0,
  });

  assert.equal(preview.enabled, true);
  assert.equal(preview.balance, 500);
  assert.equal(preview.maxPoints, 90);
  assert.equal(preview.maxDiscount, 90_000);

  // The figure the preview offers must be one redeemForOrder accepts.
  const result = await runInTransaction((session) =>
    loyaltyService.redeemForOrder(
      {
        userId: customerId,
        requestedPoints: preview.maxPoints,
        eligibleAmount: 300_000,
        orderId: new mongoose.Types.ObjectId(),
        orderCode: "OD-PREVIEW",
      },
      session
    )
  );
  assert.equal(result.discountAmount, preview.maxDiscount);
});
