// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReviewForm from "./ReviewForm";

const uploadReviewImage = vi.fn();

vi.mock("@/services/api", () => ({
  uploadsAPI: { uploadReviewImage: (...args) => uploadReviewImage(...args) },
}));

vi.mock("@/components/common/Rating", () => ({
  default: ({ value }) => <span>{value} stars</span>,
}));

afterEach(() => {
  cleanup();
  uploadReviewImage.mockReset();
});

describe("ReviewForm image uploads", () => {
  it("uploads selected images and includes their URLs in the review payload", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    uploadReviewImage
      .mockResolvedValueOnce({ data: { image: { url: "https://images.example/one.webp" } } })
      .mockResolvedValueOnce({ data: { image: { url: "https://images.example/two.webp" } } });
    render(<ReviewForm bookId="book-1" onSubmit={onSubmit} />);

    const files = [
      new File(["one"], "one.jpg", { type: "image/jpeg" }),
      new File(["two"], "two.png", { type: "image/png" }),
    ];
    fireEvent.change(screen.getByLabelText("Chọn ảnh đánh giá"), {
      target: { files },
    });

    await waitFor(() => expect(uploadReviewImage).toHaveBeenCalledTimes(2));
    expect(uploadReviewImage).toHaveBeenNthCalledWith(1, "book-1", files[0]);
    expect(screen.getByAltText("Ảnh đánh giá 2")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: /nhận xét/i }), {
      target: { value: "Sách được đóng gói rất cẩn thận" },
    });
    fireEvent.click(screen.getByRole("button", { name: /gửi đánh giá/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        5,
        "Sách được đóng gói rất cẩn thận",
        ["https://images.example/one.webp", "https://images.example/two.webp"],
      ),
    );
  });

  it("rejects selections exceeding the three-image limit before upload", () => {
    render(<ReviewForm bookId="book-1" />);
    const files = Array.from(
      { length: 4 },
      (_, index) => new File([String(index)], `${index}.jpg`, { type: "image/jpeg" }),
    );
    fireEvent.change(screen.getByLabelText("Chọn ảnh đánh giá"), {
      target: { files },
    });

    expect(screen.getByText("Bạn chỉ có thể đính kèm tối đa 3 ảnh.")).toBeTruthy();
    expect(uploadReviewImage).not.toHaveBeenCalled();
  });
});
