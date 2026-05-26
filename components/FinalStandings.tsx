"use client";

import { useMemo } from "react";
import type { AgentInstance, SimEvent } from "@/lib/engine/types";
import {
  computeStats,
  rankedStandings,
  type AgentStats,
  type SimStats,
} from "@/lib/stats/aggregate";

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
      </header>

      <ChampionPodium stats={stats} agents={agents} />

      <DefeatOrder stats={stats} agents={agents} />

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

      {(stats.most_generous || stats.most_dependent) && (
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
        </div>
      )}
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

/* ─── Champion Podium ───────────────────────────────────
 * Big winner reveal that scales by ending type:
 *  - one_survivor: 👑 CHAMPION — the single living agent
 *  - max_rounds:   🏆 LEADER   — top survivor by final_energy
 *  - all_eliminated: ☠️ 全员阵亡 (no hero)
 */
function ChampionPodium({
  stats,
  agents,
}: {
  stats: SimStats;
  agents: AgentInstance[];
}): React.ReactElement {
  let hero: AgentStats | null = null;
  let role: "champion" | "leader" | "none" = "none";

  if (stats.reason === "one_survivor" && stats.survivors.length === 1) {
    hero = stats.per_agent.find((a) => a.id === stats.survivors[0]) ?? null;
    role = "champion";
  } else if (stats.reason === "max_rounds") {
    const survivors = stats.per_agent
      .filter((a) => a.is_survivor)
      .sort((a, b) => b.final_energy - a.final_energy || a.id.localeCompare(b.id));
    hero = survivors[0] ?? null;
    role = hero ? "leader" : "none";
  }

  if (hero === null) {
    return (
      <div className="champion-podium podium-none" role="status">
        <div className="podium-skull" aria-hidden>
          ☠️
        </div>
        <div className="podium-text">
          <div className="podium-eyebrow">NO SURVIVORS</div>
          <div className="podium-name">全员阵亡</div>
          <div className="podium-meta">没有 agent 撑到终局</div>
        </div>
      </div>
    );
  }

  const color = agentColor(agents, hero.id);
  const tag = role === "champion" ? "👑 CHAMPION" : "🏆 LEADER";
  const subline =
    role === "champion"
      ? `独存到第 ${stats.total_rounds} 回合 · 末位 E=${hero.final_energy}`
      : `回合用尽时领先 · 末位 E=${hero.final_energy}`;

  return (
    <div
      className={`champion-podium podium-${role}`}
      role="status"
      style={{ ["--podium-color" as string]: color }}
    >
      <div className="podium-glow" aria-hidden />
      <div className="podium-avatar" aria-hidden>
        <span className="podium-swatch" style={{ background: color }} />
        <span className="podium-ring" />
      </div>
      <div className="podium-text">
        <div className="podium-eyebrow">{tag}</div>
        <div className="podium-name">{hero.display_name}</div>
        <div className="podium-meta">{subline}</div>
      </div>
      <div className="podium-stats">
        <div className="podium-stat">
          <span className="podium-stat-value">{hero.alive_rounds}</span>
          <span className="podium-stat-label">存活回合</span>
        </div>
        <div className="podium-stat">
          <span className="podium-stat-value">{hero.given}</span>
          <span className="podium-stat-label">给出</span>
        </div>
        <div className="podium-stat">
          <span className="podium-stat-value">{hero.received}</span>
          <span className="podium-stat-label">收到</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Order of Defeat ───────────────────────────────────
 * Horizontal round timeline with death markers + ordered list
 * showing exactly who fell first, who survived longest.
 */
function DefeatOrder({
  stats,
  agents,
}: {
  stats: SimStats;
  agents: AgentInstance[];
}): React.ReactElement | null {
  const fallen = stats.per_agent
    .filter((a) => !a.is_survivor && a.eliminated_at !== null)
    .sort(
      (a, b) =>
        (a.eliminated_at ?? Infinity) - (b.eliminated_at ?? Infinity) ||
        a.id.localeCompare(b.id),
    );
  const survivors = stats.per_agent
    .filter((a) => a.is_survivor)
    .sort((a, b) => b.final_energy - a.final_energy || a.id.localeCompare(b.id));

  if (fallen.length === 0 && survivors.length === 0) return null;

  const totalRounds = Math.max(stats.total_rounds, 1);

  return (
    <div className="defeat-order">
      <div className="defeat-order-head">
        <span className="defeat-order-title">阵亡顺序</span>
        <span className="defeat-order-sub">
          {fallen.length} 人阵亡 · {survivors.length} 人存活
        </span>
      </div>

      <div
        className="defeat-timeline"
        role="img"
        aria-label="阵亡时间轴"
      >
        <div className="timeline-track">
          {fallen.map((f, i) => {
            const round = f.eliminated_at ?? totalRounds;
            const left = (round / totalRounds) * 100;
            return (
              <div
                key={f.id}
                className="timeline-marker fallen"
                style={{
                  left: `${left}%`,
                  ["--marker-color" as string]: agentColor(agents, f.id),
                }}
                title={`${f.display_name} · 第 ${round} 回合阵亡`}
              >
                <span className="timeline-stem" aria-hidden />
                <span className="timeline-dot" aria-hidden />
                <span className="timeline-label">
                  <span className="timeline-emoji" aria-hidden>💀</span>
                  R{round}
                </span>
                <span className="timeline-sub" data-order={i + 1} aria-hidden>
                  #{i + 1}
                </span>
              </div>
            );
          })}
          {survivors.length > 0 && (
            <div
              className="timeline-marker survived"
              style={{
                left: `100%`,
                ["--marker-color" as string]: agentColor(agents, survivors[0]!.id),
              }}
              title={`${survivors.length} 名存活者`}
            >
              <span className="timeline-stem" aria-hidden />
              <span className="timeline-dot" aria-hidden />
              <span className="timeline-label">
                <span className="timeline-emoji" aria-hidden>👑</span>
                R{totalRounds}
              </span>
            </div>
          )}
        </div>
        <div className="timeline-axis" aria-hidden>
          <span>R1</span>
          <span>R{totalRounds}</span>
        </div>
      </div>

      <ol className="defeat-list">
        {fallen.map((a, i) => (
          <li className="defeat-row fallen" key={a.id}>
            <span className="defeat-order-num" aria-label={`第 ${i + 1} 个出局`}>
              {i + 1}
            </span>
            <span className="defeat-icon" aria-hidden>💀</span>
            <span
              className="defeat-swatch"
              style={{ background: agentColor(agents, a.id) }}
              aria-hidden
            />
            <span className="defeat-name">{a.display_name}</span>
            <span className="defeat-when">第 {a.eliminated_at} 回合阵亡</span>
            <span className="defeat-meta">
              存活 {a.alive_rounds} · 给出 {a.given} · 收到 {a.received}
            </span>
          </li>
        ))}
        {survivors.map((a, i) => (
          <li className="defeat-row survived" key={a.id}>
            <span className="defeat-order-num crown" aria-hidden>
              {i === 0 ? "👑" : "🏆"}
            </span>
            <span className="defeat-icon" aria-hidden />
            <span
              className="defeat-swatch"
              style={{ background: agentColor(agents, a.id) }}
              aria-hidden
            />
            <span className="defeat-name">{a.display_name}</span>
            <span className="defeat-when">存活到第 {stats.total_rounds} 回合</span>
            <span className="defeat-meta">末位 E={a.final_energy} · 给出 {a.given}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
