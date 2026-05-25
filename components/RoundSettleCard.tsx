"use client";

import type { AgentInstance, SimEvent } from "@/lib/engine/types";

type SettledEvent = Extract<SimEvent, { type: "round_settled" }>;

type Props = {
  event: SettledEvent;
  agents: AgentInstance[];
};

function agentColor(agents: AgentInstance[], id: string): string {
  const idx = agents.findIndex((a) => a.id === id);
  if (idx < 0) return "var(--text-faint)";
  return `var(--A${(idx % 10) + 1})`;
}

function nameOf(agents: AgentInstance[], id: string): string {
  return agents.find((a) => a.id === id)?.display_name ?? id;
}

export function RoundSettleCard({ event, agents }: Props): React.ReactElement {
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
          const delta =
            hasPrev && typeof before === "number" && typeof after === "number"
              ? after - before
              : null;
          return (
            <div
              key={a.id}
              className={`settle-agent-cell${isEliminated ? " eliminated" : ""}`}
            >
              <span
                className="settle-agent-swatch"
                style={{ background: agentColor(agents, a.id) }}
                aria-hidden
              />
              <span className="settle-agent-name" title={a.display_name}>
                {a.display_name}
              </span>
              <span className="settle-agent-energy">
                {hasPrev && typeof before === "number" ? (
                  <>
                    <span className="num prev">{before}</span>
                    <span className="arrow">→</span>
                    <span className="num curr">{after ?? 0}</span>
                  </>
                ) : (
                  <span className="num curr">{after ?? 0}</span>
                )}
                {delta !== null && delta !== 0 && (
                  <span className={`delta ${delta > 0 ? "up" : "down"}`}>
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                )}
                {isEliminated && <span className="elim-tag">⚰</span>}
              </span>
            </div>
          );
        })}
      </div>

      {transfers.length > 0 && (
        <div className="settle-transfers">
          <span className="settle-transfers-label">转移</span>
          <div className="settle-transfers-list">
            {transfers.map((t, i) => (
              <span key={i} className="transfer-chip">
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
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
