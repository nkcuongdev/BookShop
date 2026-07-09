// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReviewList from "./ReviewList";

vi.mock("@/components/common/Rating", () => ({
  default: ({ value }) => <span>{value} stars</span>,
}));

const review = {
  _id: "review-1",
  userId: "user-1",
  userName: "Người mua",
  rating: 5,
  comment: "Nội dung đánh giá ban đầu đủ dài",
  images: ["https://images.example/review-photo.webp"],
  verified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

afterEach(cleanup);

describe("ReviewList lifecycle actions", () => {
  it("lets the owner edit and delete their review", async () => {
    const onEdit = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <ReviewList
        reviews={[review]}
        currentUserId="user-1"
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /sửa/i }));
    const comment = screen.getByRole("textbox", { name: /nhận xét/i });
    fireEvent.change(comment, { target: { value: "Nội dung đánh giá đã được cập nhật" } });
    fireEvent.click(screen.getByRole("button", { name: /lưu thay đổi/i }));
    await waitFor(() => {
      expect(onEdit).toHaveBeenCalledWith(
        review,
        5,
        "Nội dung đánh giá đã được cập nhật",
        review.images,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /xóa/i }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(review));
  });

  it("offers reporting only for another customer's review", () => {
    render(<ReviewList reviews={[review]} currentUserId="user-2" />);
    expect(screen.getByRole("button", { name: /xem ảnh đánh giá 1/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /báo cáo/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /sửa/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /xóa/i })).toBeNull();
  });
});
