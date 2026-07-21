import { useRef, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadsAPI } from "@/services/api";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_RETURN_IMAGES = 3;

export default function ReturnEvidenceUploader({
  orderId,
  images = [],
  onChange,
  onUploadingChange,
  disabled = false,
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const resetInput = () => {
    if (fileRef.current) fileRef.current.value = "";
  };

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || uploading || disabled) return;

    const remaining = MAX_RETURN_IMAGES - images.length;
    if (files.length > remaining) {
      setError(`Bạn chỉ có thể đính kèm tối đa ${MAX_RETURN_IMAGES} ảnh.`);
      resetInput();
      return;
    }
    if (files.some((file) => !ALLOWED_IMAGE_TYPES.includes(file.type))) {
      setError("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.");
      resetInput();
      return;
    }
    if (files.some((file) => file.size > MAX_IMAGE_BYTES)) {
      setError("Mỗi ảnh không được vượt quá 5 MB.");
      resetInput();
      return;
    }
    if (!orderId) {
      setError("Không xác định được đơn hàng cần đổi trả.");
      resetInput();
      return;
    }

    setError("");
    setUploading(true);
    onUploadingChange?.(true);
    const uploaded = [];
    try {
      for (const file of files) {
        const response = await uploadsAPI.uploadReturnImage(orderId, file);
        const url = response?.data?.image?.url;
        if (!url) throw new Error("Upload không trả về URL ảnh");
        uploaded.push(url);
      }
      onChange?.([...images, ...uploaded].slice(0, MAX_RETURN_IMAGES));
    } catch (uploadError) {
      if (uploaded.length) {
        onChange?.([...images, ...uploaded].slice(0, MAX_RETURN_IMAGES));
      }
      setError(uploadError?.message || "Không thể tải ảnh lên, vui lòng thử lại.");
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      resetInput();
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <Label>Ảnh bằng chứng (không bắt buộc)</Label>
        <span className="text-xs text-muted-foreground/70">
          {images.length}/{MAX_RETURN_IMAGES}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Ảnh sách hỏng, giao sai hoặc kiện hàng bị thiếu sẽ giúp BookShop xử lý nhanh hơn.
      </p>

      {images.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {images.map((url, index) => (
            <div
              key={url}
              className="relative size-20 overflow-hidden rounded-xl border bg-muted"
            >
              <img
                src={url}
                alt={`Ảnh bằng chứng ${index + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                aria-label={`Xóa ảnh bằng chứng ${index + 1}`}
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-card/95 text-danger-strong shadow"
                onClick={() => onChange?.(images.filter((item) => item !== url))}
                disabled={uploading || disabled}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {images.length < MAX_RETURN_IMAGES && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || disabled}
          >
            {uploading ? (
              <Upload className="size-4 animate-pulse" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            {uploading ? "Đang tải ảnh..." : "Thêm ảnh bằng chứng"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(",")}
            multiple
            className="sr-only"
            aria-label="Chọn ảnh bằng chứng"
            onChange={(event) => uploadFiles(event.target.files)}
            disabled={uploading || disabled}
          />
        </>
      )}

      {error && <p className="mt-2 text-sm text-danger-strong">{error}</p>}
      <p className="mt-2 text-xs text-muted-foreground/70">
        Tối đa 3 ảnh JPEG, PNG hoặc WebP; mỗi ảnh không quá 5 MB.
      </p>
    </div>
  );
}
