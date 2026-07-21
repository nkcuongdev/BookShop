import { describe, expect, it } from "vitest";
import { formatFullAddress } from "./address.js";

describe("formatFullAddress", () => {
  it("keeps detailed and administrative address parts in delivery order", () => {
    expect(
      formatFullAddress({
        address: "12 Lê Lợi",
        ward: "Phường Bến Nghé",
        district: "Quận 1",
        city: "Thành phố Hồ Chí Minh",
      })
    ).toBe(
      "12 Lê Lợi, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh"
    );
  });
});
