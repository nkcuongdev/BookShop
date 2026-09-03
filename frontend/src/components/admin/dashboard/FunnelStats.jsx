import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact } from "@/utils/format";
import Progress from "@/components/ui/progress";

export function FunnelStats({ stages = [], isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <ul className="space-y-3">
      {stages.map((s, i) => {
        const pct = Math.round((s.value / max) * 100);
        const conv =
          i > 0
            ? ((s.value / stages[i - 1].value) * 100).toFixed(1)
            : null;
        return (
          <li key={s.stage}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium text-foreground">{s.stage}</span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{formatCompact(s.value)}</span>
                {conv && <span className="ml-2 text-[11px] text-muted-foreground/70">{conv}%</span>}
              </span>
            </div>
            <Progress value={pct} label={`${s.label}: ${pct}%`} />
          </li>
        );
      })}
    </ul>
  );
}
