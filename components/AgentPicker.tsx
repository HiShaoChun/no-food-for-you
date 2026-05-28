"use client";

import { MODEL_KEYS, getModel, type ModelKey } from "@/lib/llm/providers";
import type { Availability } from "@/lib/llm/availability";
import type { AgentInstance } from "@/lib/engine/types";

type Props = {
  agents: AgentInstance[];
  availability: Availability | null;
  onChange: (next: AgentInstance[]) => void;
  hoveredAgentId?: string | null;
};

let nextIdCounter = 0;

function nextId(existing: AgentInstance[]): string {
  let max = 0;
  for (const a of existing) {
    const m = /^A(\d+)$/.exec(a.id);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  nextIdCounter = Math.max(nextIdCounter, max);
  nextIdCounter += 1;
  return `A${nextIdCounter}`;
}

function defaultDisplayName(model_key: ModelKey, existing: AgentInstance[]): string {
  const sameModel = existing.filter((a) => a.model_key === model_key).length;
  return `${model_key} #${sameModel + 1}`;
}

function firstEnabledModel(availability: Availability | null): ModelKey {
  if (!availability) return MODEL_KEYS[0]!;
  for (const k of MODEL_KEYS) {
    const { provider } = getModel(k);
    if (availability[provider]) return k;
  }
  return MODEL_KEYS[0]!;
}

function agentColor(idx: number): string {
  // matches --A1 .. --A10 in globals.css, cycles past 10
  return `var(--A${(idx % 10) + 1})`;
}

export function AgentPicker({ agents, availability, onChange, hoveredAgentId }: Props): React.ReactElement {
  const canAdd = agents.length < 10;
  const canRemove = agents.length > 2;

  function addAgent(): void {
    const model_key = firstEnabledModel(availability);
    const next: AgentInstance = {
      id: nextId(agents),
      display_name: defaultDisplayName(model_key, agents),
      model_key,
    };
    onChange([...agents, next]);
  }

  function removeAgent(id: string): void {
    onChange(agents.filter((a) => a.id !== id));
  }

  function updateAgent(id: string, patch: Partial<AgentInstance>): void {
    onChange(agents.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  return (
    <div className="section">
      <h3>
        Agents <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>({agents.length}/10)</span>
      </h3>
      {agents.map((a, idx) => {
        const { provider } = getModel(a.model_key);
        const providerOk = availability ? availability[provider] : true;
        const isHovered = hoveredAgentId === a.id;
        const isDimmed = hoveredAgentId !== null && hoveredAgentId !== undefined && !isHovered;
        const rowClass = `agent-row${isHovered ? " is-hovered" : ""}${isDimmed ? " is-dimmed" : ""}`;
        return (
          <div key={a.id} className={rowClass} data-agent-id={a.id}>
            <span
              className="agent-swatch"
              style={{ background: agentColor(idx) }}
              title={`${a.id} — chart color`}
              aria-hidden
            />
            <input
              type="text"
              value={a.display_name}
              onChange={(e) => updateAgent(a.id, { display_name: e.target.value })}
              placeholder={`${a.model_key} #1`}
              title={`ID: ${a.id}`}
            />
            <select
              value={a.model_key}
              onChange={(e) => updateAgent(a.id, { model_key: e.target.value as ModelKey })}
              style={{ borderColor: providerOk ? "" : "var(--danger)" }}
              title={providerOk ? "" : `provider ${provider} 未配置`}
            >
              {MODEL_KEYS.map((m) => {
                const enabled = availability ? availability[getModel(m).provider] : true;
                return (
                  <option key={m} value={m} disabled={!enabled}>
                    {m}
                    {enabled ? "" : " (未配置)"}
                  </option>
                );
              })}
            </select>
            <button
              className="btn-danger"
              onClick={() => removeAgent(a.id)}
              disabled={!canRemove}
              title={canRemove ? "删除" : "至少需要 2 个 agent"}
              aria-label={`Remove ${a.display_name}`}
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        className="btn-ghost"
        onClick={addAgent}
        disabled={!canAdd}
        style={{ width: "100%", marginTop: 8 }}
      >
        + 添加 Agent
      </button>
    </div>
  );
}
