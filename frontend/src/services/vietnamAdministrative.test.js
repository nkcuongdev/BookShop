// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearVietnamAdministrativeCache,
  vietnamAdministrativeAPI,
} from "./vietnamAdministrative.js";

function jsonResponse(data) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data: { units: data } }),
  });
}

beforeEach(() => {
  clearVietnamAdministrativeCache();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("vietnamAdministrativeAPI", () => {
  it("normalizes and caches the current two-level hierarchy", async () => {
    fetch
      .mockImplementationOnce(() =>
        jsonResponse([
          { code: 1, name: "Thành phố Hà Nội" },
          { code: "", name: "Invalid" },
        ])
      )
      .mockImplementationOnce(() =>
        jsonResponse([{ code: 4, name: "Phường Ba Đình" }])
      );

    const first = await vietnamAdministrativeAPI.getProvinces("current");
    const cached = await vietnamAdministrativeAPI.getProvinces("current");
    const wards = await vietnamAdministrativeAPI.getWards({
      version: "current",
      provinceCode: "1",
    });

    expect(first).toEqual([{ code: "1", name: "Thành phố Hà Nội" }]);
    expect(cached).toBe(first);
    expect(wards).toEqual([{ code: "4", name: "Phường Ba Đình" }]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain(
      "/api/administrative/wards?version=current&provinceCode=1"
    );
  });

  it("rejects malformed administrative codes before making a request", async () => {
    expect(() =>
      vietnamAdministrativeAPI.getDistricts("../../admin")
    ).toThrow("Mã đơn vị hành chính không hợp lệ");
    expect(fetch).not.toHaveBeenCalled();
  });
});
