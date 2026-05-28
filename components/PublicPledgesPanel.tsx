"use client";

import { useMemo } from "react";
import type { AgentInstance, Pledge, SimEvent } from "@/lib/engine/types";

type Props = {
  agents: AgentInstance[];
  events: SimEvent[];
};

function pledgeKey(p: Pledge): string {
  return `${p.from}|${p.to}|${p.amount}|${p.round_made}|${p.due_round}`;
}

function deriveActive(events: SimEvent[]): Pledge[] {
  // Re-derive from event stream: collect all pledges_made minus all pledges_settled
  // (match by (from, to, round_made + 1 === round_due_settled))
  const active = new Map<string, Pledge>();
  for (const e of events) {
    if (e.type !== "round_settled") continue;
    if (Array.isArray(e.pledges_made_this_round)) {
      for (const p of e.pledges_made_this_round) active.set(pledgeKey(p), p);
    }
    if (Array.isArray(e.pledges_settled_this_round)) {
      for (const s of e.pledges_settled_this_round) {
        // settled pledge: due_round = e.round, round_made = e.round - 1
        // try matching by from/to/amount=s.pledged/due_round
        const probe: Pledge = {
          from: s.from,
          to: s.to,
          amount: s.pledged,
          round_made: e.round - 1,
          due_round: e.round,
        };
        active.delete(pledgeKey(probe));
      }
    }
  }
  return [...active.values()].sort(
    (a, b) => a.due_round - b.due_round || a.from.localeCompare(b.from),
  );
}

function nameOf(agents: AgentInstance[], id: string): string {
  return agents.find((a) => a.id === id)?.display_name ?? id;
}

function agentColor(agents: AgentInstance[], id: string): string {
  const idx = agents.findIndex((a) => a.id === id);
  if (idx < 0) return "var(--text-faint)";
  return `var(--A${(idx % 10) + 1})`;
}

export function PublicPledgesPanel({ agents, events }: Props): React.ReactElement {
  const active = useMemo(() => deriveActive(events), [events]);
  return (
    <section className="side-panel pledges-panel">
      <header className="side-panel-head">
        <span className="side-panel-title">公开承诺</span>
        <span className="side-panel-count">{active.length}</span>
      </header>
      {active.length === 0 ? (
        <div className="side-panel-empty">（暂无公开承诺）</div>
      ) : (
        <ul className="side-panel-list">
          {active.map((p, i) => (
            <li key={i} className="pledge-row">
              <div className="pledge-row-meta">
                <span className="round-tag pledge-round-tag">R{p.due_round} 到期</span>
                <span className="pledge-amount-badge">
                  承诺 <strong>{p.amount}</strong> 食物
                </span>
              </div>
              <div className="party-line">
                <span className="party-label">承诺方</span>
                <span
                  className="transfer-dot"
                  style={{ background: agentColor(agents, p.from) }}
                  aria-hidden
                />
                <span className="party-name">{nameOf(agents, p.from)}</span>
              </div>
              <div className="party-line">
                <span className="party-label">接收方</span>
                <span
                  className="transfer-dot"
                  style={{ background: agentColor(agents, p.to) }}
                  aria-hidden
                />
                <span className="party-name">{nameOf(agents, p.to)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
