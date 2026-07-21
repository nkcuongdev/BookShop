// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearBuyNowSelection,
  normalizeBuyNowSelection,
  readBuyNowSelection,
  saveBuyNowSelection,
} from "./buyNow";

const BOOK = {
  _id: "book-1",
  title: "Sách mua ngay",
  author: "Tác giả",
  imageUrl: "/cover.jpg",
  price: 120000,
  stock: 5,
};

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("normalizeBuyNowSelection", () => {
  it("keeps a valid book and quantity", () => {
    expect(normalizeBuyNowSelection({ book: BOOK, quantity: 3 })).toEqual({
      book: BOOK,
      quantity: 3,
    });
  });

  it("accepts a book keyed by id instead of _id", () => {
    const book = { id: "book-2", title: "Khác", price: 1000 };
    expect(normalizeBuyNowSelection({ book, quantity: 1 })?.quantity).toBe(1);
  });

  it("rejects missing, zero, negative and non-numeric quantities", () => {
    expect(normalizeBuyNowSelection({ book: BOOK, quantity: 0 })).toBeNull();
    expect(normalizeBuyNowSelection({ book: BOOK, quantity: -2 })).toBeNull();
    expect(normalizeBuyNowSelection({ book: BOOK, quantity: "abc" })).toBeNull();
    expect(normalizeBuyNowSelection({ book: BOOK })).toBeNull();
  });

  it("rejects a missing or unidentifiable book", () => {
    expect(normalizeBuyNowSelection({ quantity: 1 })).toBeNull();
    expect(normalizeBuyNowSelection({ book: { title: "x" }, quantity: 1 })).toBeNull();
    expect(normalizeBuyNowSelection(null)).toBeNull();
    expect(normalizeBuyNowSelection(undefined)).toBeNull();
  });

  it("floors fractional quantities", () => {
    expect(normalizeBuyNowSelection({ book: BOOK, quantity: 2.7 })?.quantity).toBe(2);
  });
});

describe("buy-now session persistence", () => {
  it("round-trips a selection through sessionStorage", () => {
    saveBuyNowSelection(BOOK, 2);
    const restored = readBuyNowSelection();
    expect(restored?.quantity).toBe(2);
    expect(restored?.book.title).toBe("Sách mua ngay");
    expect(restored?.book.price).toBe(120000);
    expect(restored?.book._id).toBe("book-1");
  });

  it("stores nothing for an invalid selection", () => {
    expect(saveBuyNowSelection(BOOK, 0)).toBeNull();
    expect(readBuyNowSelection()).toBeNull();
  });

  it("returns null when nothing was stored", () => {
    expect(readBuyNowSelection()).toBeNull();
  });

  it("returns null for corrupted stored data", () => {
    window.sessionStorage.setItem("bookshop_buy_now", "{not json");
    expect(readBuyNowSelection()).toBeNull();
  });

  it("clears the selection so a later cart checkout is not pinned to it", () => {
    saveBuyNowSelection(BOOK, 1);
    clearBuyNowSelection();
    expect(readBuyNowSelection()).toBeNull();
  });

  it("overwrites a previous selection rather than accumulating", () => {
    saveBuyNowSelection(BOOK, 1);
    saveBuyNowSelection({ _id: "book-9", title: "Mới", price: 5000 }, 4);
    const restored = readBuyNowSelection();
    expect(restored?.book._id).toBe("book-9");
    expect(restored?.quantity).toBe(4);
  });
});
