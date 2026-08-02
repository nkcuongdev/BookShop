const mongoose = require("mongoose");

// Atomic sequence generator for human-readable document codes (PN000001,
// PX000001, KK000001). A dedicated collection keeps the counter independent of
// document deletions, so codes are never reused.
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

/**
 * Reserve the next sequence value for `key` and format it as `<prefix><padded>`.
 * Uses findOneAndUpdate with upsert so concurrent callers never collide.
 */
counterSchema.statics.nextCode = async function (key, prefix, options = {}) {
  const { padding = 6, session = null } = options;
  const counter = await this.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    {
      upsert: true,
      returnDocument: "after",
      ...(session ? { session } : {}),
    }
  );
  return `${prefix}${String(counter.seq).padStart(padding, "0")}`;
};

const Counter = mongoose.model("Counter", counterSchema);
module.exports = Counter;
