"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import type { AgentInstance } from "@/lib/engine/types";

type SeriesPoint = { round: number } & Record<string, number | null>;

type Props = {
  agents: AgentInstance[];
  series: SeriesPoint[];
  hoveredAgentId?: string | null;
};

const COLORS = [
  "var(--A1)",
  "var(--A2)",
  "var(--A3)",
  "var(--A4)",
  "var(--A5)",
  "var(--A6)",
  "var(--A7)",
  "var(--A8)",
  "var(--A9)",
  "var(--A10)",
];

const RESOLVED_COLORS = [
  "#0284c7", // A1 sky
  "#ea580c", // A2 orange
  "#059669", // A3 emerald
  "#ca8a04", // A4 amber
  "#7c3aed", // A5 violet
  "#0d9488", // A6 teal
  "#db2777", // A7 pink
  "#65a30d", // A8 lime
  "#2563eb", // A9 blue
  "#e11d48", // A10 rose
];

type TooltipPayload = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string | Array<number | string>;
  color?: string;
};

function ChartTooltip({
  active,
  payload,
  label,
  agents,
}: {
  active?: boolean;
  payload?: readonly TooltipPayload[];
  label?: number | string;
  agents: AgentInstance[];
}): React.ReactElement | null {
  if (!active || !payload || payload.length === 0) return null;
  // Map dataKey (agent id) to its index in agents to pick a resolved color
  const colorById = new Map<string, string>();
  agents.forEach((a, i) => colorById.set(a.id, RESOLVED_COLORS[i % RESOLVED_COLORS.length]!));
  return (
    <div className="chart-tooltip">
      <div className="tt-round">Round {label}</div>
      {payload.map((p) => {
        const id = String(p.dataKey ?? "");
        const color = colorById.get(id) ?? "#888";
        if (p.value === null || p.value === undefined) return null;
        return (
          <div key={id} className="tt-row">
            <span className="tt-swatch" style={{ background: color }} />
            <span className="tt-name">{p.name}</span>
            <span className="tt-value">{p.value}</span>
          </div>
        );
      })}
    </div>
  );
}

export function EnergyChart({ agents, series, hoveredAgentId }: Props): React.ReactElement {
  if (series.length === 0) {
    return (
      <div className="empty">
        <div>等待第一回合结算…</div>
        <div className="hint">能量曲线将在第 1 回合后开始绘制</div>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={series} margin={{ top: 32, right: 20, bottom: 8, left: -8 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
        <XAxis
          dataKey="round"
          stroke="var(--text-faint)"
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          fontSize={11}
          dy={4}
        />
        <YAxis
          stroke="var(--text-faint)"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          width={36}
          allowDecimals={false}
        />
        <Tooltip
          content={(props) => <ChartTooltip {...props} agents={agents} />}
          cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 3" }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 6 }}
          iconType="circle"
          iconSize={8}
        />
        {agents.map((a, i) => {
          const isHovered = hoveredAgentId === a.id;
          const isDimmed = hoveredAgentId !== null && hoveredAgentId !== undefined && !isHovered;
          return (
            <Line
              key={a.id}
              type="monotone"
              dataKey={a.id}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={isHovered ? 4 : 2.25}
              strokeOpacity={isDimmed ? 0.45 : 0.95}
              dot={{ r: 2.5, strokeWidth: 0, fill: COLORS[i % COLORS.length] }}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--bg)" }}
              name={a.display_name}
              connectNulls={false}
              isAnimationActive={true}
              animationDuration={200}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}
