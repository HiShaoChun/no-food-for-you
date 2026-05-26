"use client";

import type {
  AllocationPolicy,
  GameConfig,
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

      </div>

      <div className="section">
        <h3>
          压力曲线
          <span
            className="section-hint"
            title="结算阶段对每位存活 agent 扣除能量；扣减总量越大越接近淘汰"
            aria-hidden
          >
            ⓘ
          </span>
        </h3>
        <p className="section-desc">
          每回合结算时从所有存活 agent 自动扣减的能量。能量到 0 即淘汰。
        </p>
        <PressureControl
          value={config.pressure}
          maxRounds={config.max_rounds}
          onChange={(v) => patch("pressure", v)}
        />
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

function PressureControl({
  value,
  maxRounds,
  onChange,
}: {
  value: PressureCurve;
  maxRounds: number;
  onChange: (v: PressureCurve) => void;
}): React.ReactElement {
  return (
    <>
      <div className="radio-group" role="radiogroup">
        <label title="每回合扣减相同能量">
          <input
            type="radio"
            name="pressure"
            checked={value.type === "constant"}
            onChange={() => onChange({ type: "constant", amount: 1 })}
          />
          Constant
        </label>
        <label title="扣减量线性递增">
          <input
            type="radio"
            name="pressure"
            checked={value.type === "linear"}
            onChange={() => onChange({ type: "linear", start: 1, step: 1 })}
          />
          Linear
        </label>
        <label title="扣减量在阈值处跳升">
          <input
            type="radio"
            name="pressure"
            checked={value.type === "step"}
            onChange={() => onChange({ type: "step", thresholds: [10, 20] })}
          />
          Step
        </label>
      </div>
      <p className="mode-desc">{describePressureMode(value)}</p>
      {value.type === "constant" && (
        <div className="field" style={{ marginTop: 6 }}>
          <label>每回合扣减</label>
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
            <label title="第 1 回合的扣减量">起始 (R1)</label>
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
            <label title="每回合在前一回合基础上再多扣的量">每回合 +Δ</label>
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
          <label title="例如 10,20 表示 R1..10 扣 1，R11..20 扣 2，R21+ 扣 3">
            阈值（逗号分隔，例如 10,20）
          </label>
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
      <PressurePreview curve={value} maxRounds={maxRounds} />
    </>
  );
}

function describePressureMode(v: PressureCurve): string {
  switch (v.type) {
    case "constant":
      return "固定难度：每回合从每位存活 agent 扣减相同能量。";
    case "linear":
      return "逐步加压：扣减量按 start + step × (round − 1) 线性递增，越往后越艰难。";
    case "step":
      return "阶梯加压：每越过一个阈值，扣减量就跳升 1 点。";
  }
}

function PressurePreview({
  curve,
  maxRounds,
}: {
  curve: PressureCurve;
  maxRounds: number;
}): React.ReactElement {
  const totalRounds = Math.max(1, maxRounds);

  if (curve.type === "constant") {
    const total = curve.amount * totalRounds;
    return (
      <div className="curve-preview">
        <span className="preview-label">预览</span>
        <span className="preview-chip">每回合 −{curve.amount}</span>
        <span className="preview-sep">·</span>
        <span className="preview-chip muted">
          {totalRounds} 回合累计 −{total}
        </span>
      </div>
    );
  }

  if (curve.type === "linear") {
    const candidates = [1, 2, 3, 5, 10, totalRounds];
    const checkpoints = candidates
      .filter((r, i, arr) => r <= totalRounds && arr.indexOf(r) === i)
      .sort((a, b) => a - b);
    let total = 0;
    for (let r = 1; r <= totalRounds; r++) {
      total += Math.max(0, curve.start + curve.step * (r - 1));
    }
    return (
      <div className="curve-preview">
        <span className="preview-label">预览</span>
        {checkpoints.map((r) => {
          const cost = curve.start + curve.step * (r - 1);
          return (
            <span className="preview-chip" key={r}>
              R{r} −{cost}
            </span>
          );
        })}
        <span className="preview-sep">·</span>
        <span className="preview-chip muted">累计 −{total}</span>
      </div>
    );
  }

  // step
  const sorted = [...curve.thresholds].sort((a, b) => a - b);
  const segments: Array<{ from: number; to: number; cost: number }> = [];
  let prev = 0;
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]!;
    if (t > prev && prev < totalRounds) {
      segments.push({
        from: prev + 1,
        to: Math.min(t, totalRounds),
        cost: i + 1,
      });
      prev = t;
    }
  }
  if (prev < totalRounds) {
    segments.push({ from: prev + 1, to: totalRounds, cost: sorted.length + 1 });
  }
  const total = segments.reduce(
    (acc, s) => acc + s.cost * (s.to - s.from + 1),
    0,
  );
  return (
    <div className="curve-preview">
      <span className="preview-label">预览</span>
      {segments.map((s, i) => (
        <span className="preview-chip" key={i}>
          {s.from === s.to ? `R${s.from}` : `R${s.from}..${s.to}`} −{s.cost}
        </span>
      ))}
      <span className="preview-sep">·</span>
      <span className="preview-chip muted">累计 −{total}</span>
    </div>
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
