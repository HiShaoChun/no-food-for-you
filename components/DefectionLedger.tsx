"use client";

import { useMemo } from "react";
import type { AgentInstance, SimEvent } from "@/lib/engine/types";

type Props = {
  agents: AgentInstance[];
  events: SimEvent[];
};

type LedgerEntry = {
  round: number;
  from: string;
  to: string;
  pledged: number;
  actual: number;
  bonus_paid: number;
};

function collectDefections(events: SimEvent[]): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const e of events) {
    if (e.type !== "round_settled") continue;
    if (!Array.isArray(e.pledges_settled_this_round)) continue;
    for (const s of e.pledges_settled_this_round) {
      if (s.status !== "defected") continue;
      out.push({
        round: e.round,
        from: s.from,
        to: s.to,
        pledged: s.pledged,
        actual: s.actual,
        bonus_paid: s.bonus_paid,
      });
    }
  }
  // newest first
  return out.reverse();
}

function nameOf(agents: AgentInstance[], id: string): string {
  return agents.find((a) => a.id === id)?.display_name ?? id;
}

function agentColor(agents: AgentInstance[], id: string): string {
  const idx = agents.findIndex((a) => a.id === id);
  if (idx < 0) return "var(--text-faint)";
  return `var(--A${(idx % 10) + 1})`;
}

export function DefectionLedger({ agents, events }: Props): React.ReactElement {
  const entries = useMemo(() => collectDefections(events), [events]);
  return (
    <section className="side-panel defection-panel">
      <header className="side-panel-head">
        <span className="side-panel-title">背叛记录</span>
        <span className="side-panel-count">{entries.length}</span>
      </header>
      {entries.length === 0 ? (
        <div className="side-panel-empty">（暂无背叛记录）</div>
      ) : (
        <ul className="side-panel-list">
          {entries.map((d, i) => (
            <li key={i} className="defection-row">
              <span className="round-tag">R{d.round}</span>
              <span
                className="transfer-dot"
                style={{ background: agentColor(agents, d.from) }}
                aria-hidden
              />
              <span>{nameOf(agents, d.from)}</span>
              <span className="arrow">→</span>
              <span
                className="transfer-dot"
                style={{ background: agentColor(agents, d.to) }}
                aria-hidden
              />
              <span>{nameOf(agents, d.to)}</span>
              <span className="defection-counts">
                {d.actual}/{d.pledged}
              </span>
              <span className={`defection-bonus ${d.bonus_paid >= 0 ? "pos" : "neg"}`}>
                {d.bonus_paid >= 0 ? "+" : ""}
                {d.bonus_paid}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
