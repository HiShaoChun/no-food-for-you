"use client";

import type {
  AllocationPolicy,
  GameConfig,
  InformationMode,
  PressureCurve,
} from "@/lib/engine/types";
import type { Availability } from "@/lib/llm/availability";
import { AgentPicker } from "./AgentPicker";
import { DEFAULT_SHARED_SYSTEM_PROMPT } from "@/lib/agents/prompt-template";
import { getModel } from "@/lib/llm/providers";

type Props = {
  config: GameConfig;
  availability: Availability | null;
  running: boolean;
  onChange: (cfg: GameConfig) => void;
  onStart: () => void;
};

export function ConfigPanel({ config, availability, running, onChange, onStart }: Props): React.ReactElement {
  const validation = validate(config, availability);

  function patch<K extends keyof GameConfig>(key: K, value: GameConfig[K]): void {
    onChange({ ...config, [key]: value });
  }

  return (
    <aside className="config-panel">
      <AgentPicker
        agents={config.agents}
        availability={availability}
        onChange={(agents) => patch("agents", agents)}
      />

      <div className="section">
        <h3>共享 System Prompt</h3>
        <textarea
          value={config.shared_system_prompt}
          onChange={(e) => patch("shared_system_prompt", e.target.value)}
          placeholder={DEFAULT_SHARED_SYSTEM_PROMPT}
        />
        <PromptMeta
          value={config.shared_system_prompt}
          onReset={() => patch("shared_system_prompt", DEFAULT_SHARED_SYSTEM_PROMPT)}
        />
      </div>

      <div className="section">
        <h3>游戏参数</h3>

        <div className="field">
          <label>初始 Energy</label>
          <input
            type="number"
            min={1}
            max={100}
            value={config.initial_energy}
            onChange={(e) => patch("initial_energy", parseInt(e.target.value || "10", 10))}
          />
        </div>

        <div className="field">
          <label>最大回合数</label>
          <input
            type="number"
            min={1}
            max={200}
            value={config.max_rounds}
            onChange={(e) => patch("max_rounds", parseInt(e.target.value || "30", 10))}
          />
        </div>

        <div className="field">
          <label>每回合最多请求数</label>
          <input
            type="number"
            min={1}
            max={5}
            value={config.max_requests_per_round}
            onChange={(e) => patch("max_requests_per_round", parseInt(e.target.value || "1", 10))}
          />
        </div>

        <div className="field">
          <label>种子 (master_seed)</label>
          <div className="field-inline">
            <input
              type="number"
              value={config.master_seed}
              onChange={(e) => patch("master_seed", parseInt(e.target.value || "0", 10))}
              style={{ flex: 1 }}
            />
            <button
              className="btn-ghost"
              onClick={() => patch("master_seed", Math.floor(Math.random() * 1e9))}
              title="随机种子"
            >
              🎲
            </button>
          </div>
        </div>
      </div>

      <div className="section">
        <h3>信息模式</h3>
        <InfoModeControl value={config.info_mode} onChange={(v) => patch("info_mode", v)} />
      </div>

      <div className="section">
        <h3>压力曲线</h3>
        <PressureControl value={config.pressure} onChange={(v) => patch("pressure", v)} />
      </div>

      <div className="section">
        <h3>分配策略</h3>
        <AllocationControl
          value={config.allocation_policy}
          onChange={(v) => patch("allocation_policy", v)}
        />
      </div>

      <button
        className="btn start-btn"
        disabled={running || !validation.ok}
        onClick={onStart}
        title={validation.ok ? "" : validation.reason}
      >
        {running ? "Running…" : validation.ok ? "▶  Start Simulation" : `✕  ${validation.reason}`}
      </button>
    </aside>
  );
}

function PromptMeta({
  value,
  onReset,
}: {
  value: string;
  onReset: () => void;
}): React.ReactElement {
  const trimmed = value.trim();
  const isEmpty = trimmed.length === 0;
  const isDefault = trimmed === DEFAULT_SHARED_SYSTEM_PROMPT.trim();
  const tagClass = isEmpty ? "empty" : isDefault ? "default" : "modified";
  const tagText = isEmpty ? "空" : isDefault ? "默认" : "已修改";
  return (
    <div className="prompt-meta">
      <span className={`tag ${tagClass}`} title={isDefault ? "未改动" : "改动会在 Start 时生效"}>
        <span className="dot" aria-hidden />
        {tagText}
      </span>
      <span className="char-count">{value.length} 字</span>
      {!isDefault && (
        <button
          type="button"
          className="btn-link"
          onClick={onReset}
          title="把内容还原为内置默认 prompt"
        >
          恢复默认
        </button>
      )}
    </div>
  );
}

function InfoModeControl({
  value,
  onChange,
}: {
  value: InformationMode;
  onChange: (v: InformationMode) => void;
}): React.ReactElement {
  return (
    <>
      <div className="radio-group">
        <label>
          <input
            type="radio"
            name="info_mode"
            checked={value.type === "open"}
            onChange={() => onChange({ type: "open" })}
          />
          Open
        </label>
        <label>
          <input
            type="radio"
            name="info_mode"
            checked={value.type === "blind"}
            onChange={() => onChange({ type: "blind" })}
          />
          Blind
        </label>
        <label>
          <input
            type="radio"
            name="info_mode"
            checked={value.type === "partial"}
            onChange={() => onChange({ type: "partial", k: 3 })}
          />
          Partial
        </label>
      </div>
      {value.type === "partial" && (
        <div className="field" style={{ marginTop: 6 }}>
          <label>K (最近回合数)</label>
          <input
            type="number"
            min={1}
            max={50}
            value={value.k}
            onChange={(e) =>
              onChange({ type: "partial", k: parseInt(e.target.value || "3", 10) })
            }
          />
        </div>
      )}
    </>
  );
}

function PressureControl({
  value,
  onChange,
}: {
  value: PressureCurve;
  onChange: (v: PressureCurve) => void;
}): React.ReactElement {
  return (
    <>
      <div className="radio-group">
        <label>
          <input
            type="radio"
            name="pressure"
            checked={value.type === "constant"}
            onChange={() => onChange({ type: "constant", amount: 1 })}
          />
          Constant
        </label>
        <label>
          <input
            type="radio"
            name="pressure"
            checked={value.type === "linear"}
            onChange={() => onChange({ type: "linear", start: 1, step: 1 })}
          />
          Linear
        </label>
        <label>
          <input
            type="radio"
            name="pressure"
            checked={value.type === "step"}
            onChange={() => onChange({ type: "step", thresholds: [10, 20] })}
          />
          Step
        </label>
      </div>
      {value.type === "constant" && (
        <div className="field" style={{ marginTop: 6 }}>
          <label>每回合扣</label>
          <input
            type="number"
            min={0}
            max={20}
            value={value.amount}
            onChange={(e) =>
              onChange({ type: "constant", amount: parseInt(e.target.value || "1", 10) })
            }
          />
        </div>
      )}
      {value.type === "linear" && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>起始</label>
            <input
              type="number"
              min={0}
              value={value.start}
              onChange={(e) =>
                onChange({ type: "linear", start: parseInt(e.target.value || "1", 10), step: value.step })
              }
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>每回合 +</label>
            <input
              type="number"
              min={0}
              value={value.step}
              onChange={(e) =>
                onChange({ type: "linear", start: value.start, step: parseInt(e.target.value || "1", 10) })
              }
            />
          </div>
        </div>
      )}
      {value.type === "step" && (
        <div className="field" style={{ marginTop: 6 }}>
          <label>阈值（逗号分隔，例如 10,20）</label>
          <input
            type="text"
            value={value.thresholds.join(",")}
            onChange={(e) => {
              const parts = e.target.value
                .split(",")
                .map((s) => parseInt(s.trim(), 10))
                .filter((n) => Number.isInteger(n) && n > 0);
              onChange({ type: "step", thresholds: parts.length > 0 ? parts : [10] });
            }}
          />
        </div>
      )}
    </>
  );
}

function AllocationControl({
  value,
  onChange,
}: {
  value: AllocationPolicy;
  onChange: (v: AllocationPolicy) => void;
}): React.ReactElement {
  return (
    <>
      <div className="radio-group">
        <label>
          <input
            type="radio"
            name="alloc"
            checked={value.type === "fully_free"}
            onChange={() => onChange({ type: "fully_free" })}
          />
          Free
        </label>
        <label>
          <input
            type="radio"
            name="alloc"
            checked={value.type === "capped"}
            onChange={() => onChange({ type: "capped", cap: 5 })}
          />
          Capped
        </label>
        <label>
          <input
            type="radio"
            name="alloc"
            checked={value.type === "proportional"}
            onChange={() => onChange({ type: "proportional" })}
          />
          Proportional
        </label>
      </div>
      {value.type === "capped" && (
        <div className="field" style={{ marginTop: 6 }}>
          <label>每次响应总额上限</label>
          <input
            type="number"
            min={1}
            max={50}
            value={value.cap}
            onChange={(e) =>
              onChange({ type: "capped", cap: parseInt(e.target.value || "5", 10) })
            }
          />
        </div>
      )}
    </>
  );
}

function validate(cfg: GameConfig, av: Availability | null): { ok: boolean; reason: string } {
  if (cfg.agents.length < 2) return { ok: false, reason: "至少 2 个 agent" };
  if (cfg.shared_system_prompt.trim().length === 0)
    return { ok: false, reason: "system prompt 不能为空" };
  if (av) {
    for (const a of cfg.agents) {
      const { provider } = getModel(a.model_key);
      if (!av[provider]) return { ok: false, reason: `${a.id} 的 provider 未配置` };
    }
  }
  if (cfg.initial_energy < 1) return { ok: false, reason: "initial_energy ≥ 1" };
  if (cfg.max_rounds < 1) return { ok: false, reason: "max_rounds ≥ 1" };
  return { ok: true, reason: "" };
}
