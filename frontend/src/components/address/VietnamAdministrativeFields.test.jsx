// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

const mocks = vi.hoisted(() => ({
  getProvinces: vi.fn(),
  getDistricts: vi.fn(),
  getWards: vi.fn(),
}));

vi.mock("@/services/vietnamAdministrative", () => ({
  vietnamAdministrativeAPI: {
    getProvinces: mocks.getProvinces,
    getDistricts: mocks.getDistricts,
    getWards: mocks.getWards,
  },
}));

import VietnamAdministrativeFields from "./VietnamAdministrativeFields.jsx";

function Harness(props) {
  const [value, setValue] = useState({
    address: "12 Lê Lợi",
    city: "",
    district: "",
    ward: "",
  });
  return (
    <>
      <VietnamAdministrativeFields value={value} onChange={setValue} {...props} />
      <output data-testid="address-value">{JSON.stringify(value)}</output>
    </>
  );
}

beforeEach(() => {
  mocks.getProvinces.mockImplementation((version) =>
    Promise.resolve(
      version === "legacy"
        ? [{ code: "79", name: "Thành phố Hồ Chí Minh" }]
        : [{ code: "1", name: "Thành phố Hà Nội" }]
    )
  );
  mocks.getDistricts.mockResolvedValue([
    { code: "760", name: "Quận 1" },
  ]);
  mocks.getWards.mockImplementation(({ version }) =>
    Promise.resolve(
      version === "legacy"
        ? [{ code: "26734", name: "Phường Bến Nghé" }]
        : [{ code: "4", name: "Phường Ba Đình" }]
    )
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("VietnamAdministrativeFields", () => {
  it("selects the current province and ward without changing detailed address", async () => {
    render(<Harness />);

    const province = await screen.findByLabelText("Tỉnh/Thành phố");
    await screen.findByRole("option", { name: "Thành phố Hà Nội" });
    fireEvent.change(province, { target: { value: "1" } });

    await waitFor(() =>
      expect(mocks.getWards).toHaveBeenCalledWith({
        version: "current",
        provinceCode: "1",
      })
    );
    const ward = screen.getByLabelText("Phường/Xã");
    await screen.findByRole("option", { name: "Phường Ba Đình" });
    fireEvent.change(ward, { target: { value: "4" } });

    await waitFor(() => {
      const value = JSON.parse(screen.getByTestId("address-value").textContent);
      expect(value).toMatchObject({
        address: "12 Lê Lợi",
        city: "Thành phố Hà Nội",
        district: "",
        ward: "Phường Ba Đình",
      });
    });
  });

  it("supports the legacy province, district and ward hierarchy", async () => {
    render(<Harness />);
    await screen.findByRole("option", { name: "Thành phố Hà Nội" });

    fireEvent.click(screen.getByRole("button", { name: "Có quận/huyện · 3 cấp" }));
    const province = await screen.findByLabelText("Tỉnh/Thành phố");
    await screen.findByRole("option", { name: "Thành phố Hồ Chí Minh" });
    fireEvent.change(province, { target: { value: "79" } });

    await waitFor(() => expect(mocks.getDistricts).toHaveBeenCalledWith("79"));
    const district = screen.getByLabelText("Quận/Huyện");
    await screen.findByRole("option", { name: "Quận 1" });
    fireEvent.change(district, { target: { value: "760" } });

    await waitFor(() =>
      expect(mocks.getWards).toHaveBeenCalledWith({
        version: "legacy",
        districtCode: "760",
      })
    );
    const ward = screen.getByLabelText("Phường/Xã");
    await screen.findByRole("option", { name: "Phường Bến Nghé" });
    fireEvent.change(ward, { target: { value: "26734" } });

    await waitFor(() => {
      const value = JSON.parse(screen.getByTestId("address-value").textContent);
      expect(value).toMatchObject({
        city: "Thành phố Hồ Chí Minh",
        district: "Quận 1",
        ward: "Phường Bến Nghé",
      });
    });
  });

  it("locks to the three-level catalogue when requireLegacy is set", async () => {
    render(<Harness requireLegacy />);

    // GHN only knows the pre-07/2025 catalogue, so the two-level toggle must be
    // gone and the district select present from the very first render.
    await screen.findByRole("option", { name: "Thành phố Hồ Chí Minh" });
    expect(mocks.getProvinces).toHaveBeenCalledWith("legacy");
    expect(
      screen.queryByRole("button", { name: "Hiện hành · 2 cấp" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Có quận/huyện · 3 cấp" })
    ).toBeNull();
    expect(screen.getByLabelText("Quận/Huyện")).toBeTruthy();
  });

  it("falls back to free-form fields when the catalog is unavailable", async () => {
    mocks.getProvinces.mockRejectedValueOnce(new Error("Nguồn dữ liệu đang bận"));
    render(<Harness />);

    expect(
      await screen.findByText(/Bạn vẫn có thể nhập địa chỉ thủ công/)
    ).toBeTruthy();
    const cityInput = screen.getByLabelText("Tỉnh/Thành phố");
    fireEvent.change(cityInput, { target: { value: "Tỉnh tùy chỉnh" } });

    await waitFor(() => {
      const value = JSON.parse(screen.getByTestId("address-value").textContent);
      expect(value.city).toBe("Tỉnh tùy chỉnh");
    });
  });
});
