import { describe, expect, it } from "vitest";
import {
  bookCreateSchema,
  bookDefaults,
  bookEditSchema,
  bookSchema,
  bookSchemaFor,
  publishedDateToYear,
  publishedYearToDate,
} from "./schema.js";

function validBook(overrides = {}) {
  return {
    ...bookDefaults,
    title: "Dế Mèn phiêu lưu ký",
    author: "Tô Hoài",
    price: 0,
    stock: 0,
    categoryId: "van-hoc",
    imageUrl: "https://res.cloudinary.com/demo/cover.webp",
    ...overrides,
  };
}

describe("book publishing and physical fields", () => {
  it("accepts every optional publishing and physical field when empty", () => {
    const result = bookSchema.safeParse(
      validBook({
        pages: null,
        weight: null,
        dimensions: { length: null, width: null, height: null },
      })
    );

    expect(result.success).toBe(true);
  });

  it("stores a selected publication year as a compatible API date", () => {
    expect(publishedYearToDate("2024")).toBe("2024-01-01T00:00:00.000Z");
    expect(publishedDateToYear("2024-01-01T00:00:00.000Z")).toBe("2024");
    expect(publishedYearToDate("")).toBeNull();
  });

  it("rejects values that are not a valid four-digit publication year", () => {
    expect(bookSchema.safeParse(validBook({ publishedYear: "24" })).success).toBe(
      false
    );
  });

  it("requires explicitly entered price, stock and a cover image", () => {
    expect(bookSchema.safeParse(validBook({ price: "" })).success).toBe(false);
    expect(bookSchema.safeParse(validBook({ stock: "" })).success).toBe(false);
    expect(bookSchema.safeParse(validBook({ imageUrl: "" })).success).toBe(false);
    expect(bookSchema.safeParse(validBook({ price: 0, stock: 0 })).success).toBe(
      true
    );
  });
});

describe("inventory fields", () => {
  it("only demands an opening stock when creating a book", () => {
    // Stock is owned by the inventory ledger once the book exists, so the edit
    // form neither collects nor sends it. Requiring it there would make every
    // save fail the server's STOCK_NOT_DIRECTLY_EDITABLE guard.
    const withoutStock = validBook();
    delete withoutStock.stock;

    expect(bookCreateSchema.safeParse(withoutStock).success).toBe(false);
    expect(bookEditSchema.safeParse(withoutStock).success).toBe(true);
  });

  it("strips stock out of the edit payload even when it is supplied", () => {
    const parsed = bookEditSchema.parse(validBook({ stock: 99 }));

    expect(parsed).not.toHaveProperty("stock");
  });

  it("picks the schema matching the form mode", () => {
    expect(bookSchemaFor("edit")).toBe(bookEditSchema);
    expect(bookSchemaFor("create")).toBe(bookCreateSchema);
  });

  it("treats an empty reorder threshold as the system default of 0", () => {
    const parsed = bookCreateSchema.parse(
      validBook({ reorderPoint: "", reorderQuantity: null })
    );

    expect(parsed.reorderPoint).toBe(0);
    expect(parsed.reorderQuantity).toBe(0);
  });

  it("coerces reorder thresholds to non-negative integers", () => {
    const parsed = bookCreateSchema.parse(
      validBook({ reorderPoint: "10", reorderQuantity: 30.7 })
    );

    expect(parsed.reorderPoint).toBe(10);
    expect(parsed.reorderQuantity).toBe(30);

    expect(
      bookCreateSchema.safeParse(validBook({ reorderPoint: -1 })).success
    ).toBe(false);
  });

  it("leaves the default supplier optional", () => {
    expect(
      bookCreateSchema.parse(validBook({ defaultSupplier: "" })).defaultSupplier
    ).toBe("");
    expect(
      bookCreateSchema.parse(validBook({ defaultSupplier: "abc123" }))
        .defaultSupplier
    ).toBe("abc123");
  });
});
