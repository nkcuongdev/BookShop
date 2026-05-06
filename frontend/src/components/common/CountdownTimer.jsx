import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const pad = (n) => String(n).padStart(2, "0");

function getTimeLeft(target) {
  const diff = Math.max(0, target - Date.now());
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { hours, minutes, seconds, done: diff === 0 };
}

export default function CountdownTimer({ target, variant = "dark", className }) {
  const targetTime =
    typeof target === "number" ? target : new Date(target).getTime();
  const [time, setTime] = useState(() => getTimeLeft(targetTime));

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft(targetTime)), 1000);
    return () => clearInterval(id);
  }, [targetTime]);

  const cellClass =
    variant === "dark"
      ? "bg-secondary-900 text-white"
      : "bg-white text-secondary-900 border border-gray-200";

  const cells = [
    { value: pad(time.hours), label: "GIỜ" },
    { value: pad(time.minutes), label: "PHÚT" },
    { value: pad(time.seconds), label: "GIÂY" },
  ];

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {cells.map((c, i) => (
        <div key={c.label} className="flex items-center gap-1.5">
          <div
            className={cn(
              "min-w-[44px] px-2.5 py-1.5 rounded-lg text-center font-bold font-mono shadow-sm",
              cellClass
            )}
          >
            <span className="block text-base leading-none tabular-nums">
              {c.value}
            </span>
            <span className="block text-[9px] mt-0.5 opacity-70 font-sans">
              {c.label}
            </span>
          </div>
          {i < cells.length - 1 && (
            <span className="text-base font-bold text-secondary-400">:</span>
          )}
        </div>
      ))}
    </div>
  );
}
