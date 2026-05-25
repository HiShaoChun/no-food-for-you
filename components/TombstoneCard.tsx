"use client";

import type { AgentInstance } from "@/lib/engine/types";

type Props = {
  agents: AgentInstance[];
  agent_id: string;
  round: number;
  alive_rounds: number;
  given?: number;
};

function agentColor(agents: AgentInstance[], id: string): string {
  const idx = agents.findIndex((a) => a.id === id);
  if (idx < 0) return "var(--text-faint)";
  return `var(--A${(idx % 10) + 1})`;
}

function nameOf(agents: AgentInstance[], id: string): string {
  return agents.find((a) => a.id === id)?.display_name ?? id;
}

export function TombstoneCard({
  agents,
  agent_id,
  round,
  alive_rounds,
  given,
}: Props): React.ReactElement {
  return (
    <div className="tombstone" role="note" aria-label={`${nameOf(agents, agent_id)} 已淘汰`}>
      <div className="tombstone-skull" aria-hidden>
        💀
      </div>
      <div className="tombstone-body">
        <div className="tombstone-name">
          <span
            className="tombstone-swatch"
            style={{ background: agentColor(agents, agent_id) }}
            aria-hidden
          />
          {nameOf(agents, agent_id)}
        </div>
        <div className="tombstone-meta">
          第 {round} 回合淘汰 · 存活 {alive_rounds} 回合
          {typeof given === "number" && given > 0 ? ` · 转出 ${given}` : ""}
        </div>
      </div>
    </div>
  );
}
