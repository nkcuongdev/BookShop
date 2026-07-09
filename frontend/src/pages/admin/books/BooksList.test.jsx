import { describe, expect, it } from "vitest";
import { toCSV } from "./BooksList";

describe("book CSV export", () => {
  it("adds a UTF-8 BOM and preserves Vietnamese text for Excel", () => {
    const csv = toCSV([
      {
        title: "Trường ca Achilles",
        author: "Nguyễn Nhật Ánh",
        category: "văn-học",
        price: 125000,
        stock: 18,
        sold: 1,
      },
    ]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Trường ca Achilles"');
    expect(csv).toContain('"Nguyễn Nhật Ánh"');
    expect(csv).toContain("\r\n");
  });

  it("escapes quotes inside fields", () => {
    const csv = toCSV([{ title: 'Sách "hay"' }]);

    expect(csv).toContain('"Sách ""hay"""');
  });
});
