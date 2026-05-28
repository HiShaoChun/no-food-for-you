"use client";

import type { AgentInstance } from "@/lib/engine/types";

type Props = {
  agents: AgentInstance[];
  id: string;
  onHoverChange: (id: string | null) => void;
};

function agentColor(agents: AgentInstance[], id: string): string {
  const idx = agents.findIndex((a) => a.id === id);
  if (idx < 0) return "var(--text-faint)";
  return `var(--A${(idx % 10) + 1})`;
}

export function AgentMention({ agents, id, onHoverChange }: Props): React.ReactElement {
  const color = agentColor(agents, id);
  const name = agents.find((a) => a.id === id)?.display_name ?? id;
  const style = { ["--mention-color" as string]: color } as React.CSSProperties;
  return (
    <span
      className="mention"
      data-agent-id={id}
      style={style}
      onMouseEnter={() => onHoverChange(id)}
      onMouseLeave={() => onHoverChange(null)}
      onFocus={() => onHoverChange(id)}
      onBlur={() => onHoverChange(null)}
      tabIndex={0}
    >
      <span className="mention-dot" aria-hidden />
      <span className="mention-name">@{name}</span>
    </span>
  );
}
