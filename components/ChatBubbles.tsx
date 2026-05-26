"use client";

import { useEffect, useMemo, useRef } from "react";
import type { AgentInstance, SimEvent } from "@/lib/engine/types";
import { RoundSettleCard } from "./RoundSettleCard";
import { TombstoneCard } from "./TombstoneCard";
import { FinalStandings } from "./FinalStandings";
import { computeStats } from "@/lib/stats/aggregate";

type Props = {
  agents: AgentInstance[];
  events: SimEvent[];
  initialEnergy: number;
};

function agentColor(agents: AgentInstance[], id: string): string {
  const idx = agents.findIndex((a) => a.id === id);
  if (idx < 0) return "var(--text-faint)";
  return `var(--A${(idx % 10) + 1})`;
}

function Avatar({ color }: { color: string }): React.ReactElement {
  return <span className="avatar" style={{ background: color }} aria-hidden />;
}

export function ChatBubbles({ agents, events, initialEnergy }: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const nameOf = (id: string): string => agents.find((a) => a.id === id)?.display_name ?? id;

  // Precompute per-agent stats so the tombstones can show "given X / survived N rounds"
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
    if (e.type === "agent_decision") {
      const p = e.parsed;
      const color = agentColor(agents, e.agent);
      if (p === null) {
        blocks.push(
          <div key={`d-${idx}`} className="bubble err">
            <div className="head">
              <Avatar color={color} />
              <span className="name">{nameOf(e.agent)}</span>
              <span className="chip err">Error</span>
            </div>
            <div className="body">
              解析失败{e.parse_error ? ` · ${e.parse_error}` : ""}
            </div>
            {e.raw && (
              <details>
                <summary>show raw</summary>
                <div className="raw">{e.raw}</div>
              </details>
            )}
          </div>,
        );
      } else if (p.action === "request") {
        blocks.push(
          <div key={`d-${idx}`} className="bubble req">
            <div className="head">
              <Avatar color={color} />
              <span className="name">{nameOf(e.agent)}</span>
              <span className="arrow">→</span>
              <span className="target">{nameOf(p.target)}</span>
              <span className="chip req">Request</span>
            </div>
            <div className="body">{p.message}</div>
          </div>,
        );
      } else if (p.action === "respond") {
        blocks.push(
          <div key={`d-${idx}`} className="bubble resp">
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
          </div>,
        );
      } else {
        blocks.push(
          <div key={`d-${idx}`} className="bubble noop">
            <div className="head">
              <Avatar color={color} />
              <span className="name">{nameOf(e.agent)}</span>
              <span className="chip noop">Noop</span>
            </div>
            <div className="body">无动作</div>
          </div>,
        );
      }
      return;
    }
    if (e.type === "round_settled") {
      // ① Tombstones for any newly-eliminated agents (rendered before the settle card)
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
      // ② Round settlement card
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
      blocks.push(
        <FinalStandings
          key={`final-${idx}`}
          agents={agents}
          events={events}
        />,
      );
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
