import { useRef, useState } from "react";
import { ImageOff, ImagePlus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { uploadsAPI } from "@/services/api";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function ImageUploader({
  value,
  onChange,
  className,
  ratio = "3/4",
  purpose = "book",
  disabled = false,
}) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Track which URL failed instead of a bare flag, so a new URL retries the
  // preview without an extra render pass.
  const [failedUrl, setFailedUrl] = useState("");
  const fileRef = useRef(null);
  const dragDepthRef = useRef(0);
  const previewFailed = Boolean(value) && failedUrl === value;

  const handleFile = async (file) => {
    if (!file || uploading || disabled) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Ảnh không được vượt quá 5 MB");
      return;
    }

    setUploading(true);
    try {
      const response = await uploadsAPI.uploadImage(file, purpose);
      const url = response?.data?.image?.url;
      if (!url) throw new Error("Upload không trả về URL ảnh");
      onChange?.(url);
      toast.success("Đã tải ảnh lên");
    } catch (error) {
      toast.error(error?.message || "Không thể tải ảnh lên");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDragEnter = (event) => {
    event.preventDefault();
    if (disabled) return;
    dragDepthRef.current += 1;
    setDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    if (!disabled) void handleFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted",
          dragging && "border-primary bg-primary/5",
          uploading && "cursor-wait opacity-70",
          disabled && "opacity-70",
          "aspect-[3/4]"
        )}
        style={ratio !== "3/4" ? { aspectRatio: ratio } : undefined}
        onDragEnter={handleDragEnter}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {value ? (
          <>
            {previewFailed ? (
              <div className="flex flex-col items-center gap-2 px-4 text-center text-muted-foreground">
                <ImageOff className="size-8" />
                <span className="text-xs font-medium">
                  Không tải được ảnh này
                </span>
                <span className="text-[11px] leading-snug">
                  Ảnh có thể đã bị xoá hoặc kho ảnh đang tạm thời gián đoạn.
                </span>
              </div>
            ) : (
              <img
                src={value}
                alt="Xem trước ảnh"
                className="h-full w-full object-cover"
                onError={() => setFailedUrl(value)}
              />
            )}
            <button
              type="button"
              onClick={() => onChange?.("")}
              className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-card/90 text-foreground shadow hover:bg-card"
              aria-label="Xóa ảnh"
            >
              <X className="size-4" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground/70">
            <ImagePlus className="size-8" />
            <span className="text-xs font-medium">
              {dragging ? "Thả ảnh vào đây" : "Kéo thả ảnh vào đây"}
            </span>
            <span className="text-[11px]">JPEG, PNG hoặc WebP · tối đa 5 MB</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || disabled}
        >
          <Upload className="size-4" />
          {uploading ? "Đang tải..." : disabled ? "Không có quyền tải ảnh" : "Tải ảnh"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          className="hidden"
          disabled={uploading || disabled}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>
    </div>
  );
}
