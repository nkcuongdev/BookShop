process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const supertest = require("supertest");

const app = require("../src/index");
const Book = require("../src/models/Book");

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Book.syncIndexes();
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({})
    )
  );
});

test("home sections return only the top five books per category", async () => {
  await Book.create(
    ["fiction", "business"].flatMap((category) =>
      Array.from({ length: 8 }, (_, sold) => ({
        title: `${category}-${sold}`,
        author: "Author",
        category,
        price: 100_000,
        stock: 10,
        sold,
        status: "active",
      }))
    )
  );

  const response = await supertest(app).get("/api/books/home");
  assert.equal(response.status, 200);
  for (const category of ["fiction", "business"]) {
    const books = response.body.data.booksByCategory[category];
    assert.equal(books.length, 5);
    assert.deepEqual(
      books.map((book) => book.sold),
      [7, 6, 5, 4, 3]
    );
  }
});
