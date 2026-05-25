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
  series: SeriesPoint[]; // one entry per settled round
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

export function EnergyChart({ agents, series }: Props): React.ReactElement {
  if (series.length === 0) {
    return <div className="empty">等待第一回合结算...</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={series} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="round" stroke="var(--text-dim)" fontSize={11} />
        <YAxis stroke="var(--text-dim)" fontSize={11} />
        <Tooltip
          contentStyle={{
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {agents.map((a, i) => (
          <Line
            key={a.id}
            type="monotone"
            dataKey={a.id}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
            name={a.display_name}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
