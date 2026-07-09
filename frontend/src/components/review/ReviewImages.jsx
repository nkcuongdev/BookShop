import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function ReviewImages({
  images = [],
  className,
  imageLabel = "ảnh đánh giá",
  dialogTitle = "Ảnh thực tế trong đánh giá",
  dialogDescription = "Ảnh do khách hàng đã mua sản phẩm tải lên.",
}) {
  const validImages = Array.isArray(images) ? images.filter(Boolean).slice(0, 3) : [];
  const [selectedIndex, setSelectedIndex] = useState(-1);

  if (!validImages.length) return null;

  return (
    <>
      <div className={cn("mt-3 flex flex-wrap gap-2", className)}>
        {validImages.map((url, index) => (
          <button
            key={url}
            type="button"
            className="size-20 overflow-hidden rounded-xl border border-border bg-muted transition hover:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            aria-label={`Xem ${imageLabel} ${index + 1}`}
            onClick={() => setSelectedIndex(index)}
          >
            <img
              src={url}
              alt={`${imageLabel} ${index + 1}`}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      <Dialog
        open={selectedIndex >= 0}
        onOpenChange={(open) => !open && setSelectedIndex(-1)}
      >
        <DialogContent className="max-w-3xl overflow-hidden p-3 sm:p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          {selectedIndex >= 0 && (
            <img
              src={validImages[selectedIndex]}
              alt={`${imageLabel} ${selectedIndex + 1}`}
              className="max-h-[80vh] w-full rounded-lg bg-muted object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
