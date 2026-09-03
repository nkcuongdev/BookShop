import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, formatVND } from "@/utils/format";
import { ChartTooltip } from "./ChartTooltip";
import { chartTheme, chartSeries } from "./chartTheme";

// Revenue and cost stacked against each other, with profit as the gap. Kept
// separate from RevenueAreaChart, which plots revenue against order count and
// carries its own fixed tooltip.
const COST_COLOR = chartSeries[1];

const tooltipRows = (point) => [
  { label: "Doanh thu", value: formatVND(point.revenue), accent: true },
  { label: "Giá vốn", value: formatVND(point.cost) },
  { label: "Lợi nhuận gộp", value: formatVND(point.grossProfit) },
  { label: "Biên lợi nhuận", value: `${point.margin}%` },
];

export function ProfitAreaChart({ data = [] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="profitRevenueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartTheme.brand} stopOpacity={0.35} />
              <stop offset="100%" stopColor={chartTheme.brand} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="profitCostGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COST_COLOR} stopOpacity={0.3} />
              <stop offset="100%" stopColor={COST_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={chartTheme.grid}
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: chartTheme.axis }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v) => formatCompact(v)}
            tick={{ fontSize: 11, fill: chartTheme.axis }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            content={<ChartTooltip rows={tooltipRows} />}
            cursor={{ stroke: chartTheme.brand, strokeDasharray: 3 }}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, color: chartTheme.axis }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            name="Doanh thu"
            stroke={chartTheme.brand}
            strokeWidth={2.5}
            fill="url(#profitRevenueGrad)"
          />
          <Area
            type="monotone"
            dataKey="cost"
            name="Giá vốn"
            stroke={COST_COLOR}
            strokeWidth={2}
            fill="url(#profitCostGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
