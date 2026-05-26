"use client";

import type { AgentInstance, SimEvent } from "@/lib/engine/types";

type SettledEvent = Extract<SimEvent, { type: "round_settled" }>;

type Props = {
  event: SettledEvent;
  agents: AgentInstance[];
  initialEnergy: number;
};

function agentColor(agents: AgentInstance[], id: string): string {
  const idx = agents.findIndex((a) => a.id === id);
  if (idx < 0) return "var(--text-faint)";
  return `var(--A${(idx % 10) + 1})`;
}

function nameOf(agents: AgentInstance[], id: string): string {
  return agents.find((a) => a.id === id)?.display_name ?? id;
}

function pct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

export function RoundSettleCard({
  event,
  agents,
  initialEnergy,
}: Props): React.ReactElement {
  const prev = event.prev_energies ?? {};
  const curr = event.energies;
  const transfers = event.transfers ?? [];
  const pressure = event.pressure_cost;
  const hasPrev = Object.keys(prev).length > 0;

  return (
    <section className="settle-card">
      <header className="settle-card-head">
        <span className="settle-card-label">ROUND {event.round} · SETTLED</span>
        {typeof pressure === "number" && pressure > 0 && (
          <span className="settle-card-pressure" title="本回合维持费">
            压力 −{pressure}
          </span>
        )}
      </header>

      <div className="settle-card-grid">
        {agents.map((a) => {
          const before = prev[a.id];
          const after = curr[a.id];
          const isEliminated = event.eliminated.includes(a.id);
          const hasBefore = hasPrev && typeof before === "number";
          const hasAfter = typeof after === "number";
          const delta =
            hasBefore && hasAfter ? (after as number) - (before as number) : null;

          // Visual max: use initialEnergy as the reference baseline, but expand
          // if energies exceed it (rare — happens via transfers).
          const max = Math.max(initialEnergy, before ?? 0, after ?? 0, 1);
          const afterVal = hasAfter ? (after as number) : 0;
          const beforeVal = hasBefore ? (before as number) : afterVal;
          const lossWidth =
            delta !== null && delta < 0 ? pct(-delta, max) : 0;
          const gainWidth =
            delta !== null && delta > 0 ? pct(delta, max) : 0;
          const afterPct = pct(afterVal, max);
          const beforePct = pct(beforeVal, max);

          const ratio = max > 0 ? afterVal / max : 0;
          let healthClass = "ok";
          if (isEliminated || afterVal <= 0) healthClass = "dead";
          else if (ratio <= 0.3) healthClass = "critical";
          else if (ratio <= 0.6) healthClass = "low";

          const color = agentColor(agents, a.id);

          return (
            <div
              key={a.id}
              className={`settle-agent-cell${isEliminated ? " eliminated" : ""}`}
              data-health={healthClass}
            >
              <div className="settle-agent-top">
                <span
                  className="settle-agent-swatch"
                  style={{ background: color }}
                  aria-hidden
                />
                <span className="settle-agent-name" title={a.display_name}>
                  {a.display_name}
                </span>
                <span className="settle-agent-energy">
                  {isEliminated ? (
                    <span className="elim-tag" aria-label="已淘汰">
                      ⚰
                    </span>
                  ) : (
                    <>
                      <span className="num curr">{afterVal}</span>
                      <span className="num-sep">/</span>
                      <span className="num max">{initialEnergy}</span>
                    </>
                  )}
                  {delta !== null && delta !== 0 && (
                    <span className={`delta ${delta > 0 ? "up" : "down"}`}>
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                </span>
              </div>

              <div
                className="energy-bar"
                role="progressbar"
                aria-valuenow={afterVal}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={`${a.display_name} 能量 ${afterVal} / ${initialEnergy}`}
              >
                <span
                  className="energy-bar-fill"
                  style={{
                    width: `${afterPct}%`,
                    background: isEliminated ? "transparent" : color,
                  }}
                />
                {lossWidth > 0 && !isEliminated && (
                  <span
                    className="energy-bar-loss"
                    style={{
                      left: `${afterPct}%`,
                      width: `${lossWidth}%`,
                    }}
                    title={`−${-delta!}`}
                  />
                )}
                {gainWidth > 0 && !isEliminated && (
                  <span
                    className="energy-bar-gain"
                    style={{
                      left: `${beforePct}%`,
                      width: `${gainWidth}%`,
                    }}
                    title={`+${delta!}`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {transfers.length > 0 && (
        <div className="settle-transfers">
          <span className="settle-transfers-label">转移</span>
          <div className="settle-transfers-list">
            {transfers.map((t, i) => (
              <span
                key={i}
                className={`transfer-chip${t.reason ? " has-reason" : ""}`}
                title={t.reason ? `${nameOf(agents, t.from)} → ${nameOf(agents, t.to)}（${t.amount}）：${t.reason}` : undefined}
              >
                <span
                  className="transfer-dot"
                  style={{ background: agentColor(agents, t.from) }}
                  aria-hidden
                />
                <span className="transfer-from">{nameOf(agents, t.from)}</span>
                <span className="arrow">→</span>
                <span
                  className="transfer-dot"
                  style={{ background: agentColor(agents, t.to) }}
                  aria-hidden
                />
                <span className="transfer-to">{nameOf(agents, t.to)}</span>
                <span className="transfer-amount">{t.amount}</span>
                {t.reason && <span className="transfer-reason-marker" aria-hidden>💬</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
