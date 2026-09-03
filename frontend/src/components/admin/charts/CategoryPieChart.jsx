import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltip } from "./ChartTooltip";
import { chartSeries } from "./chartTheme";

const tooltipRows = (point) => [
  { label: point.name, value: `${point.value}%`, accent: true },
];

export function CategoryPieChart({ data = [] }) {
  return (
    <div className="flex h-72 w-full flex-col">
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
            >
              {data.map((entry, i) => (
                <Cell
                  key={entry.name ?? i}
                  fill={chartSeries[i % chartSeries.length]}
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip rows={tooltipRows} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-2 pb-1 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            {/* Inline style is unavoidable here: the swatch colour is data-driven,
                so it cannot be a Tailwind class. */}
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: chartSeries[i % chartSeries.length] }}
            />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="ml-auto font-semibold text-foreground">
              {d.value}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
