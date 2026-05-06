import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#ed7620", "#f19340", "#fad7ac", "#3b82f6", "#8b5cf6"];

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
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #f1f5f9",
                fontSize: 12,
              }}
              formatter={(v) => [`${v}%`, "Tỉ trọng"]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-2 pb-1 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span className="text-secondary-600">{d.name}</span>
            <span className="ml-auto font-semibold text-secondary-800">
              {d.value}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
