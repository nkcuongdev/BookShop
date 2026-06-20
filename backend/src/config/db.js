const mongoose = require("mongoose");
const config = require("./index");

async function assertTransactionSupport(connection) {
  const hello = await connection.db.admin().command({ hello: 1 });
  const supported = Boolean(hello.setName) || hello.msg === "isdbgrid";
  if (!supported) {
    throw new Error(
      "MongoDB transactions are required. Start MongoDB as a replica set (for local development run: docker compose up -d mongo)."
    );
  }
  return hello;
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri);
    await assertTransactionSupport(conn.connection);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    await mongoose.disconnect().catch(() => null);
    throw error;
  }
};

module.exports = connectDB;
module.exports.assertTransactionSupport = assertTransactionSupport;
