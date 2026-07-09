// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uploadImage: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  uploadsAPI: { uploadImage: mocks.uploadImage },
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

import { ImageUploader } from "./ImageUploader.jsx";

describe("ImageUploader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("only offers file selection and does not expose a URL input", () => {
    render(<ImageUploader value="" onChange={() => {}} />);

    expect(screen.getByRole("button", { name: "Tải ảnh" })).toBeTruthy();
    expect(screen.queryByPlaceholderText("Dán URL ảnh...")).toBeNull();
    expect(screen.getByText("Kéo thả ảnh vào đây")).toBeTruthy();
  });

  it("uploads a dropped image and returns the managed URL", async () => {
    const onChange = vi.fn();
    mocks.uploadImage.mockResolvedValue({
      data: { image: { url: "https://res.cloudinary.com/demo/cover.webp" } },
    });
    const { container } = render(
      <ImageUploader value="" onChange={onChange} />
    );
    const file = new File(["image"], "cover.png", { type: "image/png" });
    const dropZone = container.querySelector("[class*='aspect-']");

    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await waitFor(() =>
      expect(mocks.uploadImage).toHaveBeenCalledWith(file, "book")
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        "https://res.cloudinary.com/demo/cover.webp"
      )
    );
  });
});
