import { useState } from "react";
import { bannerSrcSet } from "@/features/home/banners";
import { cn } from "@/lib/utils";

/**
 * One banner artwork. `object-contain` inside a box of the artwork's own
 * ratio, so the image is never stretched or cropped. If the file fails to
 * load, the banner's text (its alt) is shown on a brand tint instead of a
 * broken-image icon, and the surrounding link still works.
 */
export default function BannerImage({ banner, sizes, priority = false, className }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={banner.alt}
        className={cn(
          "flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-100 via-primary-50 to-brand-muted p-4 text-center font-display text-sm font-semibold text-primary-800 sm:text-base",
          className
        )}
      >
        {banner.alt}
      </div>
    );
  }

  return (
    <img
      src={banner.src}
      srcSet={bannerSrcSet(banner)}
      sizes={sizes}
      width={banner.width}
      height={banner.height}
      alt={banner.alt}
      loading={priority ? "eager" : "lazy"}
      fetchpriority={priority ? "high" : undefined}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn("block h-full w-full select-none object-contain", className)}
    />
  );
}
