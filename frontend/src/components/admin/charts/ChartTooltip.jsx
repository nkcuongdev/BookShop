/**
 * Shared recharts tooltip.
 *
 * Replaces two different treatments: RevenueAreaChart had a real JSX card while
 * OrdersBarChart and CategoryPieChart each inlined a duplicate `contentStyle`
 * object. Unifying upward to the JSX card (rather than down to contentStyle)
 * means the tooltip follows the design tokens automatically.
 *
 * Lives in charts/ rather than ui/ on purpose: importing it from ui/ risks
 * pulling it into a shared chunk, and everything here must stay inside the
 * lazy-loaded admin bundle to keep the initial-JS budget clean.
 *
 * @param rows  [{ label, value, accent }] — `accent` renders the value in the
 *              brand colour, for the series the chart is primarily about.
 */
export function ChartTooltip({ active, payload, label, rows }) {
  if (!active || !payload?.length) return null;

  const resolved =
    typeof rows === "function" ? rows(payload[0].payload, payload) : rows;
  if (!resolved?.length) return null;

  return (
    <div className="rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/[0.08] text-xs shadow-float">
      {label != null && (
        <p className="font-semibold text-foreground">{label}</p>
      )}
      <div className={label != null ? "mt-1 space-y-0.5" : "space-y-0.5"}>
        {resolved.map((row) => (
          <p key={row.label} className="text-muted-foreground">
            {row.label}:{" "}
            <span
              className={
                row.accent
                  ? "font-semibold text-primary"
                  : "font-semibold text-foreground"
              }
            >
              {row.value}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}
