import { useRef, useState } from "react";
import { ImagePlus, Link2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ImageUploader({ value, onChange, className, ratio = "3/4" }) {
  const [urlInput, setUrlInput] = useState("");
  const fileRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 1_000_000) {
      window.alert("Anh toi da 1MB. Hay dung URL anh hoac nen anh truoc khi tai len.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => onChange?.(e.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-200 bg-gray-50",
          "aspect-[3/4]"
        )}
        style={ratio !== "3/4" ? { aspectRatio: ratio } : undefined}
      >
        {value ? (
          <>
            <img
              src={value}
              alt="preview"
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <button
              type="button"
              onClick={() => onChange?.("")}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-secondary-700 shadow hover:bg-white"
              aria-label="Xoá ảnh"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-secondary-400">
            <ImagePlus className="h-8 w-8" />
            <span className="text-xs">Chưa có ảnh</span>
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
        >
          <Upload className="h-3.5 w-3.5" />
          Tải ảnh
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary-400" />
          <Input
            placeholder="Dán URL ảnh..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            if (urlInput.trim()) {
              onChange?.(urlInput.trim());
              setUrlInput("");
            }
          }}
        >
          Áp dụng
        </Button>
      </div>
    </div>
  );
}
