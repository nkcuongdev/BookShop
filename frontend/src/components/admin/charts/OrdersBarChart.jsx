import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "./ChartTooltip";
import { chartTheme } from "./chartTheme";

const tooltipRows = (point) => [
  { label: "Đơn hàng", value: point.orders, accent: true },
];

export function OrdersBarChart({ data = [] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            tick={{ fontSize: 11, fill: chartTheme.axis }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            content={<ChartTooltip rows={tooltipRows} />}
            cursor={{ fill: chartTheme.grid }}
          />
          <Bar dataKey="orders" fill={chartTheme.brand} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
