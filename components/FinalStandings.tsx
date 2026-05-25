"use client";

import { useMemo } from "react";
import type { AgentInstance, SimEvent } from "@/lib/engine/types";
import { computeStats, rankedStandings } from "@/lib/stats/aggregate";

type Props = {
  agents: AgentInstance[];
  events: SimEvent[];
};

function agentColor(agents: AgentInstance[], id: string): string {
  const idx = agents.findIndex((a) => a.id === id);
  if (idx < 0) return "var(--text-faint)";
  return `var(--A${(idx % 10) + 1})`;
}

const REASON_LABEL: Record<string, string> = {
  max_rounds: "回合用尽",
  all_eliminated: "全员淘汰",
  one_survivor: "决出独存",
};

export function FinalStandings({ agents, events }: Props): React.ReactElement | null {
  const stats = useMemo(() => computeStats(agents, events), [agents, events]);
  const ranked = useMemo(() => rankedStandings(stats.per_agent), [stats.per_agent]);

  if (stats.reason === null) return null;

  const reasonLabel = REASON_LABEL[stats.reason] ?? stats.reason;
  const totalTokens = stats.total_tokens.input + stats.total_tokens.output;

  return (
    <section className="final-standings">
      <header className="fs-header">
        <div className="fs-title">
          <span className="fs-flag" aria-hidden>🏁</span>
          <span>GAME OVER</span>
        </div>
        <div className="fs-subtitle">
          <span className={`fs-reason fs-reason-${stats.reason}`}>{reasonLabel}</span>
          <span className="fs-dot">·</span>
          <span>持续 {stats.total_rounds} 回合</span>
          {totalTokens > 0 && (
            <>
              <span className="fs-dot">·</span>
              <span className="num">总 token {totalTokens.toLocaleString()}</span>
            </>
          )}
        </div>
        {stats.reason === "one_survivor" && stats.survivors.length === 1 && (
          <div className="fs-crown">
            <span aria-hidden>👑</span>
            <span>幸存者：{
              agents.find((a) => a.id === stats.survivors[0])?.display_name ?? stats.survivors[0]
            }</span>
          </div>
        )}
      </header>

      <table className="fs-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Agent</th>
            <th className="num">生存</th>
            <th className="num">给出</th>
            <th className="num">收到</th>
            <th className="num">请求</th>
            <th className="num">响应</th>
            <th className="num">末位 E</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((s, i) => {
            const rank = i + 1;
            const medal = !s.is_survivor ? "⚰" : rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`;
            return (
              <tr key={s.id} className={s.is_survivor ? "fs-row survivor" : "fs-row dead"}>
                <td className="fs-rank" aria-label={`第 ${rank} 名`}>
                  {medal}
                </td>
                <td className="fs-agent">
                  <span
                    className="fs-swatch"
                    style={{ background: agentColor(agents, s.id) }}
                    aria-hidden
                  />
                  <span>{s.display_name}</span>
                </td>
                <td className="num">{s.alive_rounds}</td>
                <td className="num given">{s.given}</td>
                <td className="num received">{s.received}</td>
                <td className="num">{s.requests}</td>
                <td className="num">{s.responses}</td>
                <td className="num">{s.final_energy}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="fs-awards">
        {stats.most_generous && stats.most_generous.given > 0 && (
          <Award
            icon="🏅"
            label="最慷慨"
            agentName={stats.most_generous.display_name}
            detail={`转出 ${stats.most_generous.given} 点`}
            swatch={agentColor(agents, stats.most_generous.id)}
          />
        )}
        {stats.most_dependent && stats.most_dependent.requests > 0 && (
          <Award
            icon="💸"
            label="最依赖"
            agentName={stats.most_dependent.display_name}
            detail={`${stats.most_dependent.requests} 次请求`}
            swatch={agentColor(agents, stats.most_dependent.id)}
          />
        )}
        {stats.longest_survivor && (
          <Award
            icon="🏆"
            label="长寿王"
            agentName={stats.longest_survivor.display_name}
            detail={`存活 ${stats.longest_survivor.alive_rounds} 回合`}
            swatch={agentColor(agents, stats.longest_survivor.id)}
          />
        )}
      </div>
    </section>
  );
}

function Award({
  icon,
  label,
  agentName,
  detail,
  swatch,
}: {
  icon: string;
  label: string;
  agentName: string;
  detail: string;
  swatch: string;
}): React.ReactElement {
  return (
    <div className="fs-award">
      <span className="fs-award-icon" aria-hidden>
        {icon}
      </span>
      <span className="fs-award-label">{label}</span>
      <span className="fs-award-agent">
        <span className="fs-swatch" style={{ background: swatch }} aria-hidden />
        {agentName}
      </span>
      <span className="fs-award-detail">{detail}</span>
    </div>
  );
}
