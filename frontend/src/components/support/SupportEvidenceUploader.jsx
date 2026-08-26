import { useRef, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadsAPI } from "@/services/api";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export default function SupportEvidenceUploader({ orderId, images, onChange, disabled }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const upload = async (fileList) => {
    const files = Array.from(fileList || []);
    inputRef.current.value = "";
    if (!files.length) return;
    if (!orderId) return setError("Vui lòng chọn đơn hàng trước khi tải ảnh.");
    if (files.length > 3 - images.length) return setError("Bạn chỉ có thể đính kèm tối đa 3 ảnh.");
    if (files.some((file) => !TYPES.includes(file.type))) return setError("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.");
    if (files.some((file) => file.size > MAX_BYTES)) return setError("Mỗi ảnh không được vượt quá 5 MB.");
    setError("");
    setUploading(true);
    try {
      const next = [...images];
      for (const file of files) {
        const response = await uploadsAPI.uploadSupportTicketImage(orderId, file);
        next.push(response.data.image.url);
      }
      onChange(next);
    } catch (uploadError) {
      setError(uploadError.message || "Không thể tải ảnh lên");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url, index) => (
            <div key={url} className="relative size-20 overflow-hidden rounded-xl border bg-muted">
              <img src={url} alt={`Bằng chứng ${index + 1}`} className="size-full object-cover" />
              <button type="button" aria-label={`Xóa ảnh ${index + 1}`} onClick={() => onChange(images.filter((item) => item !== url))} className="absolute right-1 top-1 rounded-full bg-card/95 p-1 text-danger-strong" disabled={disabled || uploading}>
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {images.length < 3 && (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled || uploading || !orderId}>
            {uploading ? <Upload className="size-4 animate-pulse" /> : <ImagePlus className="size-4" />}
            {uploading ? "Đang tải..." : "Thêm ảnh bằng chứng"}
          </Button>
          <input ref={inputRef} type="file" multiple accept={TYPES.join(",")} className="sr-only" onChange={(event) => upload(event.target.files)} />
        </>
      )}
      <p className="text-xs text-muted-foreground">Tối đa 3 ảnh, mỗi ảnh không quá 5 MB.</p>
      {error && <p className="text-sm text-danger-strong">{error}</p>}
    </div>
  );
}
