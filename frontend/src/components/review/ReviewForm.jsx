import { useState } from "react";
import { Send } from "lucide-react";
import Rating from "@/components/common/Rating";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function ReviewForm({ onSubmit, submitting = false }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!comment.trim() || comment.trim().length < 10) {
      setError("Nhận xét cần ít nhất 10 ký tự.");
      return;
    }
    try {
      await onSubmit?.(rating, comment.trim());
      setComment("");
      setRating(5);
    } catch (err) {
      setError(err?.message || "Không thể gửi đánh giá, thử lại.");
    }
  };

  return (
    <form
      onSubmit={submit}
      className="bg-gray-50 border border-gray-100 rounded-2xl p-5 space-y-4"
    >
      <div>
        <Label className="mb-2 block">Đánh giá của bạn</Label>
        <Rating
          value={rating}
          size="lg"
          interactive
          onChange={setRating}
        />
      </div>
      <div>
        <Label htmlFor="comment" className="mb-2 block">
          Nhận xét
        </Label>
        <textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="Chia sẻ trải nghiệm của bạn về cuốn sách này..."
          className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none"
          maxLength={500}
        />
        <p className="mt-1 text-xs text-secondary-400 text-right">
          {comment.length}/500
        </p>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2.5">
          {error}
        </p>
      )}
      <Button type="submit" disabled={submitting}>
        <Send className="w-4 h-4" />
        {submitting ? "Đang gửi..." : "Gửi đánh giá"}
      </Button>
    </form>
  );
}
