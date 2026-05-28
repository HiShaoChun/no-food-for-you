"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentInstance,
  AgentDecisionPhaseEvent,
  AgentResponsePhaseEvent,
  SimEvent,
} from "@/lib/engine/types";
import { RoundSettleCard } from "./RoundSettleCard";
import { TombstoneCard } from "./TombstoneCard";
import { FinalStandings } from "./FinalStandings";
import { computeStats } from "@/lib/stats/aggregate";
import { AgentMention } from "./AgentMention";
import { useStickyScroll } from "./hooks/useStickyScroll";

type Props = {
  agents: AgentInstance[];
  events: SimEvent[];
  initialEnergy: number;
  showInnerThought: boolean;
  hoveredAgentId: string | null;
  onHoverAgentChange: (id: string | null) => void;
};

function agentColor(agents: AgentInstance[], id: string): string {
  const idx = agents.findIndex((a) => a.id === id);
  if (idx < 0) return "var(--text-faint)";
  return `var(--A${(idx % 10) + 1})`;
}

function Avatar({ color }: { color: string }): React.ReactElement {
  return <span className="avatar" style={{ background: color }} aria-hidden />;
}

function InnerThought({ text }: { text: string }): React.ReactElement | null {
  if (!text || text.trim().length === 0) return null;
  return (
    <div className="inner-thought" title="inner_thought · 仅研究者可见">
      <span className="inner-thought-label">思路</span>
      <span className="inner-thought-text">{text}</span>
    </div>
  );
}

function PledgeChips({
  pledges,
  agents,
  dueRound,
  onHoverChange,
}: {
  pledges: { to: string; amount: number }[];
  agents: AgentInstance[];
  dueRound: number;
  onHoverChange: (id: string | null) => void;
}): React.ReactElement | null {
  if (pledges.length === 0) return null;
  return (
    <div className="pledge-chips">
      {pledges.map((p, i) => (
        <span className="pledge-chip" key={`${p.to}-${i}`}>
          <span className="pledge-icon" aria-hidden>◆</span>
          <span>承诺</span>
          <span className="arrow">→</span>
          <AgentMention agents={agents} id={p.to} onHoverChange={onHoverChange} />
          <span className="amount">{p.amount}</span>
          <span className="due">R{dueRound}</span>
        </span>
      ))}
    </div>
  );
}

/** Visual state for the per-(round, agent, phase) cell during streaming. */
type CellState =
  | { kind: "thinking"; round: number; agent: string; phase: "decision" | "response"; startedAt: number }
  | { kind: "decision"; event: AgentDecisionPhaseEvent }
  | { kind: "response"; event: AgentResponsePhaseEvent };

function ThinkingBubble({
  agents,
  agentId,
  phase,
  startedAt,
}: {
  agents: AgentInstance[];
  agentId: string;
  phase: "decision" | "response";
  startedAt: number;
}): React.ReactElement {
  const color = agentColor(agents, agentId);
  const name = agents.find((a) => a.id === agentId)?.display_name ?? agentId;
  const [timedOut, setTimedOut] = useState(() => Date.now() - startedAt >= 60_000);
  useEffect(() => {
    if (timedOut) return;
    const remaining = 60_000 - (Date.now() - startedAt);
    if (remaining <= 0) {
      setTimedOut(true);
      return;
    }
    const id = window.setTimeout(() => setTimedOut(true), remaining);
    return () => window.clearTimeout(id);
  }, [startedAt, timedOut]);
  return (
    <div className={`bubble thinking${timedOut ? " timeout" : ""}`} data-phase={phase}>
      <div className="head">
        <Avatar color={color} />
        <span className="name">{name}</span>
        <span className="chip phase">{phase === "decision" ? "决策" : "响应"}</span>
      </div>
      <div className="body thinking-body">
        <span className="thinking-dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="thinking-label">{timedOut ? "响应超时·等待中" : "正在思考…"}</span>
      </div>
    </div>
  );
}

function DecisionPhaseBubble({
  e,
  agents,
  showInnerThought,
  onHoverChange,
}: {
  e: AgentDecisionPhaseEvent;
  agents: AgentInstance[];
  showInnerThought: boolean;
  onHoverChange: (id: string | null) => void;
}): React.ReactElement {
  const color = agentColor(agents, e.agent);
  const name = agents.find((a) => a.id === e.agent)?.display_name ?? e.agent;
  if (e.parsed === null) {
    return (
      <div className="bubble err">
        <div className="head">
          <Avatar color={color} />
          <span className="name">{name}</span>
          <span className="chip phase">决策</span>
          <span className="chip err">Error</span>
        </div>
        <div className="body">解析失败{e.parse_error ? ` · ${e.parse_error}` : ""}</div>
        {e.raw && (
          <details>
            <summary>show raw</summary>
            <div className="raw">{e.raw}</div>
          </details>
        )}
      </div>
    );
  }
  const p = e.parsed;
  const isEmpty = p.requests.length === 0 && p.pledges.length === 0;
  if (isEmpty) {
    return (
      <div className="bubble noop">
        <div className="head">
          <Avatar color={color} />
          <span className="name">{name}</span>
          <span className="chip phase">决策</span>
          <span className="chip noop">无动作</span>
        </div>
        {showInnerThought && <InnerThought text={p.inner_thought} />}
      </div>
    );
  }
  return (
    <div className="bubble req">
      <div className="head">
        <Avatar color={color} />
        <span className="name">{name}</span>
        <span className="chip phase">决策</span>
      </div>
      <div className="body">
        {p.requests.length > 0 && (
          <div className="alloc-list">
            {p.requests.map((r, i) => (
              <div className="alloc" key={`req-${i}`}>
                <span className="arrow">→</span>
                <AgentMention agents={agents} id={r.target} onHoverChange={onHoverChange} />
                <span className="alloc-reason">· {r.message}</span>
              </div>
            ))}
          </div>
        )}
        <PledgeChips
          pledges={p.pledges}
          agents={agents}
          dueRound={e.round + 1}
          onHoverChange={onHoverChange}
        />
      </div>
      {showInnerThought && <InnerThought text={p.inner_thought} />}
    </div>
  );
}

function ResponsePhaseBubble({
  e,
  agents,
  showInnerThought,
  onHoverChange,
}: {
  e: AgentResponsePhaseEvent;
  agents: AgentInstance[];
  showInnerThought: boolean;
  onHoverChange: (id: string | null) => void;
}): React.ReactElement {
  const color = agentColor(agents, e.agent);
  const name = agents.find((a) => a.id === e.agent)?.display_name ?? e.agent;
  if (e.parsed === null) {
    return (
      <div className="bubble err">
        <div className="head">
          <Avatar color={color} />
          <span className="name">{name}</span>
          <span className="chip phase">响应</span>
          <span className="chip err">Error</span>
        </div>
        <div className="body">解析失败{e.parse_error ? ` · ${e.parse_error}` : ""}</div>
        {e.raw && (
          <details>
            <summary>show raw</summary>
            <div className="raw">{e.raw}</div>
          </details>
        )}
      </div>
    );
  }
  const p = e.parsed;
  const isEmpty = p.allocations.length === 0 && p.pledges.length === 0;
  if (isEmpty) {
    return (
      <div className="bubble noop">
        <div className="head">
          <Avatar color={color} />
          <span className="name">{name}</span>
          <span className="chip phase">响应</span>
          <span className="chip noop">无分配</span>
        </div>
        {showInnerThought && <InnerThought text={p.inner_thought} />}
      </div>
    );
  }
  return (
    <div className="bubble resp">
      <div className="head">
        <Avatar color={color} />
        <span className="name">{name}</span>
        <span className="chip phase">响应</span>
      </div>
      <div className="body">
        {p.allocations.length > 0 && (
          <div className="alloc-list">
            {p.allocations.map((al, i) => (
              <span className="alloc" key={`a-${i}`}>
                <span className="arrow">→</span>
                <AgentMention agents={agents} id={al.to} onHoverChange={onHoverChange} />
                <span className="amount">{al.amount}</span>
                {al.reason && <span className="alloc-reason">· {al.reason}</span>}
              </span>
            ))}
          </div>
        )}
        <PledgeChips
          pledges={p.pledges}
          agents={agents}
          dueRound={e.round + 1}
          onHoverChange={onHoverChange}
        />
      </div>
      {showInnerThought && <InnerThought text={p.inner_thought} />}
    </div>
  );
}

export function ChatBubbles({
  agents,
  events,
  initialEnergy,
  showInnerThought,
  hoveredAgentId,
  onHoverAgentChange,
}: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  void hoveredAgentId; // currently unused inside the list itself; hover state is driven via callback

  const stats = useMemo(() => computeStats(agents, events), [agents, events]);
  const statsById = useMemo(
    () => new Map(stats.per_agent.map((s) => [s.id, s])),
    [stats.per_agent],
  );

  // ── Build a stable map keyed by (round, agent, phase) so a started event renders a
  //    placeholder and the corresponding _phase event replaces it in place. We iterate
  //    events in SSE arrival order — that order IS the desired render order.
  //
  // For each cell key, the rule is: a _phase event always wins over a _started event.
  // If the phase event arrives before the started event (backlog replay edge case),
  // we still render the phase event and skip the placeholder.
  const cells = useMemo(() => {
    const map = new Map<string, CellState>();
    const orderedKeys: string[] = [];
    for (const e of events) {
      if (e.type === "agent_decision_started") {
        const key = `${e.round}:${e.agent}:decision`;
        if (!map.has(key)) {
          orderedKeys.push(key);
          map.set(key, {
            kind: "thinking",
            round: e.round,
            agent: e.agent,
            phase: "decision",
            startedAt: Date.parse(e.t) || Date.now(),
          });
        }
      } else if (e.type === "agent_response_started") {
        const key = `${e.round}:${e.agent}:response`;
        if (!map.has(key)) {
          orderedKeys.push(key);
          map.set(key, {
            kind: "thinking",
            round: e.round,
            agent: e.agent,
            phase: "response",
            startedAt: Date.parse(e.t) || Date.now(),
          });
        }
      } else if (e.type === "agent_decision_phase") {
        const key = `${e.round}:${e.agent}:decision`;
        if (!map.has(key)) orderedKeys.push(key);
        map.set(key, { kind: "decision", event: e });
      } else if (e.type === "agent_response_phase") {
        const key = `${e.round}:${e.agent}:response`;
        if (!map.has(key)) orderedKeys.push(key);
        map.set(key, { kind: "response", event: e });
      }
    }
    return { map, orderedKeys };
  }, [events]);

  // ── Sticky scroll: deps = number of events received. Each new event "counts" as
  //    a new message for the indicator while scrolled away.
  const { pinned, newCount, jumpToBottom } = useStickyScroll(ref, [events.length]);

  // ── Build the linear render list. Each event is rendered at its position based on
  //    event type: phase/started events render via the cells map (so phase replaces started
  //    in place), other events (round divider, settle card, tombstone, final) render directly.
  //    A cell key only emits a single bubble at the FIRST event that touches it.
  const renderedCellKeys = new Set<string>();
  const blocks: React.ReactElement[] = [];
  let currentRound = -1;
  events.forEach((e, idx) => {
    if (e.type === "round_started" && e.round !== currentRound) {
      currentRound = e.round;
      blocks.push(
        <div key={`r${e.round}-start-${idx}`} className="round-divider">
          <span className="label">Round {e.round}</span>
        </div>,
      );
      return;
    }
    if (
      e.type === "agent_decision_started" ||
      e.type === "agent_decision_phase"
    ) {
      const key = `${e.round}:${e.agent}:decision`;
      if (renderedCellKeys.has(key)) return;
      renderedCellKeys.add(key);
      const cell = cells.map.get(key);
      if (!cell) return;
      blocks.push(
        <CellRenderer
          key={`cell-${key}`}
          cell={cell}
          agents={agents}
          showInnerThought={showInnerThought}
          onHoverChange={onHoverAgentChange}
        />,
      );
      return;
    }
    if (
      e.type === "agent_response_started" ||
      e.type === "agent_response_phase"
    ) {
      const key = `${e.round}:${e.agent}:response`;
      if (renderedCellKeys.has(key)) return;
      renderedCellKeys.add(key);
      const cell = cells.map.get(key);
      if (!cell) return;
      blocks.push(
        <CellRenderer
          key={`cell-${key}`}
          cell={cell}
          agents={agents}
          showInnerThought={showInnerThought}
          onHoverChange={onHoverAgentChange}
        />,
      );
      return;
    }
    if (e.type === "round_settled") {
      for (const id of e.eliminated) {
        const s = statsById.get(id);
        blocks.push(
          <TombstoneCard
            key={`tomb-${e.round}-${id}-${idx}`}
            agents={agents}
            agent_id={id}
            round={e.round}
            alive_rounds={s?.alive_rounds ?? e.round}
            given={s?.given}
          />,
        );
      }
      blocks.push(
        <RoundSettleCard
          key={`settle-${e.round}-${idx}`}
          event={e}
          agents={agents}
          initialEnergy={initialEnergy}
        />,
      );
      return;
    }
    if (e.type === "sim_ended") {
      blocks.push(<FinalStandings key={`final-${idx}`} agents={agents} events={events} />);
      return;
    }
  });

  return (
    <div className="bubbles" ref={ref}>
      {blocks.length === 0 && (
        <div className="empty">
          <div>等待开始</div>
          <div className="hint">点击左侧 Start Simulation 启动一轮博弈</div>
        </div>
      )}
      {blocks}
      {!pinned && newCount > 0 && (
        <button
          type="button"
          className="jump-to-bottom"
          onClick={jumpToBottom}
          aria-label="跳到底部"
        >
          {newCount} 条新消息 ↓
        </button>
      )}
    </div>
  );
}

function CellRenderer({
  cell,
  agents,
  showInnerThought,
  onHoverChange,
}: {
  cell: CellState;
  agents: AgentInstance[];
  showInnerThought: boolean;
  onHoverChange: (id: string | null) => void;
}): React.ReactElement {
  if (cell.kind === "thinking") {
    return (
      <ThinkingBubble
        agents={agents}
        agentId={cell.agent}
        phase={cell.phase}
        startedAt={cell.startedAt}
      />
    );
  }
  if (cell.kind === "decision") {
    return (
      <DecisionPhaseBubble
        e={cell.event}
        agents={agents}
        showInnerThought={showInnerThought}
        onHoverChange={onHoverChange}
      />
    );
  }
  return (
    <ResponsePhaseBubble
      e={cell.event}
      agents={agents}
      showInnerThought={showInnerThought}
      onHoverChange={onHoverChange}
    />
  );
}
