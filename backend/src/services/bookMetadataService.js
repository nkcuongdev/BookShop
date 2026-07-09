const Author = require("../models/Author");
const Publisher = require("../models/Publisher");
const {
  entityKey,
  isValidIsbn,
  normalizeEntityName,
  normalizeIsbn,
} = require("../utils/bookMetadata");

async function findOrCreate(Model, name, session) {
  const normalizedName = normalizeEntityName(name);
  if (!normalizedName) return null;
  const normalizedKey = entityKey(normalizedName);
  return Model.findOneAndUpdate(
    { normalizedKey },
    {
      $setOnInsert: { name: normalizedName, normalizedKey },
      $addToSet: { aliases: normalizedName },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true, session }
  );
}

async function resolveBookMetadata(payload, session) {
  if (payload.author !== undefined || payload.contributors !== undefined) {
    const primaryName = normalizeEntityName(payload.author);
    const submittedContributors = Array.isArray(payload.contributors)
      ? payload.contributors
      : [];
    const contributors = [];
    const seen = new Set();
    const source = [
      ...(primaryName ? [{ name: primaryName, role: "author" }] : []),
      ...submittedContributors,
    ];

    for (const submitted of source) {
      const name = normalizeEntityName(submitted?.name);
      const role = String(submitted?.role || "author").toLowerCase();
      const key = `${entityKey(name)}:${role}`;
      if (!name || seen.has(key)) continue;
      seen.add(key);
      const person = await findOrCreate(Author, name, session);
      contributors.push({ person: person._id, name: person.name, role });
    }

    const primary = contributors.find((entry) => entry.role === "author");
    if (primary) {
      payload.author = primary.name;
      payload.authorId = primary.person;
    }
    payload.contributors = contributors;
  }

  if (payload.publisher !== undefined) {
    const publisher = await findOrCreate(Publisher, payload.publisher, session);
    if (publisher) {
      payload.publisher = publisher.name;
      payload.publisherId = publisher._id;
    } else {
      payload.publisher = "";
      payload.publisherId = null;
    }
  }
  return payload;
}

async function backfillBookMetadata() {
  const Book = require("../models/Book");
  const cursor = Book.find({
    $or: [
      { authorId: null },
      { contributors: { $size: 0 } },
      { publisher: { $nin: ["", null] }, publisherId: null },
      { editionGroup: null },
      { isbn: { $nin: ["", null] }, isbnNormalized: null },
    ],
  })
    .select("_id author publisher contributors editionGroup isbn isbnNormalized")
    .lean()
    .cursor();
  let updated = 0;

  for await (const book of cursor) {
    const payload = {
      author: book.author,
      publisher: book.publisher,
      contributors: book.contributors,
    };
    await resolveBookMetadata(payload);
    const normalizedIsbn = normalizeIsbn(book.isbn);
    await Book.updateOne(
      { _id: book._id },
      {
        $set: {
          author: payload.author,
          authorId: payload.authorId,
          contributors: payload.contributors,
          publisher: payload.publisher,
          publisherId: payload.publisherId,
          editionGroup: book.editionGroup || book._id,
          isbnNormalized:
            normalizedIsbn && isValidIsbn(normalizedIsbn) ? normalizedIsbn : null,
        },
      }
    );
    updated += 1;
  }
  return updated;
}

module.exports = { backfillBookMetadata, resolveBookMetadata };
