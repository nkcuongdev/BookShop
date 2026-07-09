import { useRef, useState } from "react";
import { ImagePlus, Send, Upload, X } from "lucide-react";
import Rating from "@/components/common/Rating";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadsAPI } from "@/services/api";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REVIEW_IMAGES = 3;

export default function ReviewForm({
  onSubmit,
  submitting = false,
  initialRating = 5,
  initialComment = "",
  initialImages = [],
  bookId,
  submitLabel = "Gửi đánh giá",
  onCancel,
  resetOnSuccess = true,
}) {
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);
  const [images, setImages] = useState(() =>
    Array.isArray(initialImages)
      ? initialImages.filter(Boolean).slice(0, MAX_REVIEW_IMAGES)
      : [],
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const fileRef = useRef(null);

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || uploading) return;

    const remaining = MAX_REVIEW_IMAGES - images.length;
    if (files.length > remaining) {
      setError(`Bạn chỉ có thể đính kèm tối đa ${MAX_REVIEW_IMAGES} ảnh.`);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (files.some((file) => !ALLOWED_IMAGE_TYPES.includes(file.type))) {
      setError("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (files.some((file) => file.size > MAX_IMAGE_BYTES)) {
      setError("Mỗi ảnh không được vượt quá 5 MB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (!bookId) {
      setError("Không xác định được sách cần đánh giá.");
      return;
    }

    setError("");
    setUploading(true);
    const uploaded = [];
    try {
      for (const file of files) {
        const response = await uploadsAPI.uploadReviewImage(bookId, file);
        const url = response?.data?.image?.url;
        if (!url) throw new Error("Upload không trả về URL ảnh");
        uploaded.push(url);
      }
      setImages((current) => [...current, ...uploaded].slice(0, MAX_REVIEW_IMAGES));
    } catch (err) {
      if (uploaded.length) {
        setImages((current) => [...current, ...uploaded].slice(0, MAX_REVIEW_IMAGES));
      }
      setError(err?.message || "Không thể tải ảnh lên, vui lòng thử lại.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitting || uploading || submittingRef.current) return;

    setError("");
    if (!comment.trim() || comment.trim().length < 10) {
      setError("Nhận xét cần ít nhất 10 ký tự.");
      return;
    }

    submittingRef.current = true;
    try {
      await onSubmit?.(rating, comment.trim(), images);
      if (resetOnSuccess) {
        setComment("");
        setRating(5);
        setImages([]);
      }
    } catch (err) {
      setError(err?.message || "Không thể gửi đánh giá, thử lại.");
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl bg-muted ring-1 ring-foreground/[0.06] p-5"
    >
      <div>
        <Label className="mb-2 block">Đánh giá của bạn</Label>
        <Rating value={rating} size="lg" interactive onChange={setRating} />
      </div>

      <div>
        <Label htmlFor="comment" className="mb-2 block">
          Nhận xét
        </Label>
        <textarea
          id="comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={4}
          placeholder="Chia sẻ trải nghiệm của bạn về cuốn sách này..."
          className="w-full resize-none rounded-xl border border-border bg-card p-3 text-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          maxLength={500}
        />
        <p className="mt-1 text-right text-xs text-muted-foreground/70">{comment.length}/500</p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <Label>Ảnh thực tế (không bắt buộc)</Label>
          <span className="text-xs text-muted-foreground/70">
            {images.length}/{MAX_REVIEW_IMAGES}
          </span>
        </div>
        {images.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {images.map((url, index) => (
              <div
                key={url}
                className="relative size-20 overflow-hidden rounded-xl border bg-muted"
              >
                <img
                  src={url}
                  alt={`Ảnh đánh giá ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  aria-label={`Xóa ảnh đánh giá ${index + 1}`}
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-card/95 text-danger-strong shadow"
                  onClick={() =>
                    setImages((current) => current.filter((item) => item !== url))
                  }
                  disabled={uploading || submitting}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        {images.length < MAX_REVIEW_IMAGES && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || submitting}
            >
              {uploading ? (
                <Upload className="size-4 animate-pulse" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              {uploading ? "Đang tải ảnh..." : "Thêm ảnh"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp"
              aria-label="Chọn ảnh đánh giá"
              className="hidden"
              onChange={(event) => void uploadFiles(event.target.files)}
              disabled={uploading || submitting}
            />
          </>
        )}
        <p className="mt-2 text-xs text-muted-foreground/70">
          Tối đa 3 ảnh JPEG, PNG hoặc WebP; mỗi ảnh không quá 5 MB.
        </p>
      </div>

      {error && <p className="rounded-lg bg-danger-muted p-2.5 text-sm text-danger-strong">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" loading={submitting || uploading}>
          <Send className="size-4" />
          {submitting ? "Đang gửi..." : uploading ? "Đang tải ảnh..." : submitLabel}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            loading={submitting || uploading}
          >
            Hủy
          </Button>
        )}
      </div>
    </form>
  );
}
