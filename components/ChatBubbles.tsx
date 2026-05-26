"use client";

import { useEffect, useMemo, useRef } from "react";
import type {
  AgentInstance,
  AgentDecisionPhaseEvent,
  AgentResponsePhaseEvent,
  LegacyAgentDecisionEvent,
  SimEvent,
} from "@/lib/engine/types";
import { RoundSettleCard } from "./RoundSettleCard";
import { TombstoneCard } from "./TombstoneCard";
import { FinalStandings } from "./FinalStandings";
import { computeStats } from "@/lib/stats/aggregate";

type Props = {
  agents: AgentInstance[];
  events: SimEvent[];
  initialEnergy: number;
  showInnerThought: boolean;
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
  nameOf,
  dueRound,
}: {
  pledges: { to: string; amount: number }[];
  nameOf: (id: string) => string;
  dueRound: number;
}): React.ReactElement | null {
  if (pledges.length === 0) return null;
  return (
    <div className="pledge-chips">
      {pledges.map((p, i) => (
        <span className="pledge-chip" key={`${p.to}-${i}`}>
          <span className="pledge-icon" aria-hidden>◆</span>
          <span>承诺</span>
          <span className="arrow">→</span>
          <span>{nameOf(p.to)}</span>
          <span className="amount">{p.amount}</span>
          <span className="due">R{dueRound}</span>
        </span>
      ))}
    </div>
  );
}

function DecisionPhaseBubble({
  e,
  agents,
  nameOf,
  showInnerThought,
}: {
  e: AgentDecisionPhaseEvent;
  agents: AgentInstance[];
  nameOf: (id: string) => string;
  showInnerThought: boolean;
}): React.ReactElement {
  const color = agentColor(agents, e.agent);
  if (e.parsed === null) {
    return (
      <div className="bubble err">
        <div className="head">
          <Avatar color={color} />
          <span className="name">{nameOf(e.agent)}</span>
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
          <span className="name">{nameOf(e.agent)}</span>
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
        <span className="name">{nameOf(e.agent)}</span>
        <span className="chip phase">决策</span>
      </div>
      <div className="body">
        {p.requests.length > 0 && (
          <div className="alloc-list">
            {p.requests.map((r, i) => (
              <div className="alloc" key={`req-${i}`}>
                <span className="arrow">→</span>
                <span>{nameOf(r.target)}</span>
                <span className="alloc-reason">· {r.message}</span>
              </div>
            ))}
          </div>
        )}
        <PledgeChips pledges={p.pledges} nameOf={nameOf} dueRound={e.round + 1} />
      </div>
      {showInnerThought && <InnerThought text={p.inner_thought} />}
    </div>
  );
}

function ResponsePhaseBubble({
  e,
  agents,
  nameOf,
  showInnerThought,
}: {
  e: AgentResponsePhaseEvent;
  agents: AgentInstance[];
  nameOf: (id: string) => string;
  showInnerThought: boolean;
}): React.ReactElement {
  const color = agentColor(agents, e.agent);
  if (e.parsed === null) {
    return (
      <div className="bubble err">
        <div className="head">
          <Avatar color={color} />
          <span className="name">{nameOf(e.agent)}</span>
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
          <span className="name">{nameOf(e.agent)}</span>
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
        <span className="name">{nameOf(e.agent)}</span>
        <span className="chip phase">响应</span>
      </div>
      <div className="body">
        {p.allocations.length > 0 && (
          <div className="alloc-list">
            {p.allocations.map((al, i) => (
              <span className="alloc" key={`a-${i}`}>
                <span className="arrow">→</span>
                <span>{nameOf(al.to)}</span>
                <span className="amount">{al.amount}</span>
                {al.reason && <span className="alloc-reason">· {al.reason}</span>}
              </span>
            ))}
          </div>
        )}
        <PledgeChips pledges={p.pledges} nameOf={nameOf} dueRound={e.round + 1} />
      </div>
      {showInnerThought && <InnerThought text={p.inner_thought} />}
    </div>
  );
}

function LegacyDecisionBubble({
  e,
  agents,
  nameOf,
}: {
  e: LegacyAgentDecisionEvent;
  agents: AgentInstance[];
  nameOf: (id: string) => string;
}): React.ReactElement {
  const color = agentColor(agents, e.agent);
  const p = e.parsed;
  if (p === null) {
    return (
      <div className="bubble err">
        <div className="head">
          <Avatar color={color} />
          <span className="name">{nameOf(e.agent)}</span>
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
  if (p.action === "request") {
    return (
      <div className="bubble req">
        <div className="head">
          <Avatar color={color} />
          <span className="name">{nameOf(e.agent)}</span>
          <span className="arrow">→</span>
          <span className="target">{nameOf(p.target)}</span>
          <span className="chip req">Request</span>
        </div>
        <div className="body">{p.message}</div>
      </div>
    );
  }
  if (p.action === "respond") {
    return (
      <div className="bubble resp">
        <div className="head">
          <Avatar color={color} />
          <span className="name">{nameOf(e.agent)}</span>
          <span className="chip resp">Allocate</span>
        </div>
        <div className="body">
          {p.allocations.length === 0 ? (
            <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>（空分配）</span>
          ) : (
            <div className="alloc-list">
              {p.allocations.map((al, i) => (
                <span className="alloc" key={`${al.to}-${i}`}>
                  <span className="arrow">→</span>
                  {nameOf(al.to)}
                  <span className="amount">{al.amount}</span>
                  {al.reason && <span className="alloc-reason">· {al.reason}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="bubble noop">
      <div className="head">
        <Avatar color={color} />
        <span className="name">{nameOf(e.agent)}</span>
        <span className="chip noop">Noop</span>
      </div>
      <div className="body">无动作</div>
    </div>
  );
}

export function ChatBubbles({
  agents,
  events,
  initialEnergy,
  showInnerThought,
}: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const nameOf = (id: string): string => agents.find((a) => a.id === id)?.display_name ?? id;

  const stats = useMemo(() => computeStats(agents, events), [agents, events]);
  const statsById = useMemo(
    () => new Map(stats.per_agent.map((s) => [s.id, s])),
    [stats.per_agent],
  );

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

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
    if (e.type === "agent_decision_phase") {
      blocks.push(
        <DecisionPhaseBubble
          key={`d-${idx}`}
          e={e}
          agents={agents}
          nameOf={nameOf}
          showInnerThought={showInnerThought}
        />,
      );
      return;
    }
    if (e.type === "agent_response_phase") {
      blocks.push(
        <ResponsePhaseBubble
          key={`r-${idx}`}
          e={e}
          agents={agents}
          nameOf={nameOf}
          showInnerThought={showInnerThought}
        />,
      );
      return;
    }
    if (e.type === "agent_decision") {
      blocks.push(
        <LegacyDecisionBubble key={`l-${idx}`} e={e} agents={agents} nameOf={nameOf} />,
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
    </div>
  );
}
