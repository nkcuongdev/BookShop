import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-gray-200/70", className)}
      {...props}
    />
  );
}

export { Skeleton };
