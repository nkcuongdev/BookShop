import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, formatVND } from "@/utils/format";

function TooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-secondary-800">{label}</p>
      <p className="mt-1 text-secondary-500">
        Doanh thu: <span className="font-semibold text-primary-600">{formatVND(item.revenue)}</span>
      </p>
      <p className="text-secondary-500">
        Đơn hàng: <span className="font-semibold text-secondary-800">{item.orders}</span>
      </p>
    </div>
  );
}

export function RevenueAreaChart({ data = [] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ed7620" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#ed7620" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v) => formatCompact(v)}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip content={<TooltipContent />} cursor={{ stroke: "#ed7620", strokeDasharray: 3 }} />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#ed7620"
            strokeWidth={2.5}
            fill="url(#revenueGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
