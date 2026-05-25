"use client";

import { useEffect, useRef } from "react";
import type { AgentInstance, SimEvent } from "@/lib/engine/types";

type Props = {
  agents: AgentInstance[];
  events: SimEvent[];
};

export function ChatBubbles({ agents, events }: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const nameOf = (id: string): string => agents.find((a) => a.id === id)?.display_name ?? id;

  useEffect(() => {
    // auto-scroll to bottom on new event
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  // Group events by round for clean dividers
  const blocks: React.ReactElement[] = [];
  let currentRound = -1;
  events.forEach((e, idx) => {
    if (e.type === "round_started" && e.round !== currentRound) {
      currentRound = e.round;
      blocks.push(
        <div key={`r${e.round}-start-${idx}`} className="round-divider">
          Round {e.round}
        </div>,
      );
      return;
    }
    if (e.type === "agent_decision") {
      const p = e.parsed;
      if (p === null) {
        blocks.push(
          <div key={`d-${idx}`} className="bubble err">
            <div className="head">
              {nameOf(e.agent)} · 解析失败 {e.parse_error ? `(${e.parse_error})` : ""}
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
              {nameOf(e.agent)} → {nameOf(p.target)} (Request)
            </div>
            <div>{p.message}</div>
          </div>,
        );
      } else if (p.action === "respond") {
        blocks.push(
          <div key={`d-${idx}`} className="bubble resp">
            <div className="head">{nameOf(e.agent)} (Allocate)</div>
            <div>
              {p.allocations.length === 0
                ? "（空分配）"
                : p.allocations
                    .map((a) => `→ ${nameOf(a.to)}: ${a.amount}`)
                    .join("，")}
            </div>
          </div>,
        );
      } else {
        blocks.push(
          <div key={`d-${idx}`} className="bubble noop">
            <div className="head">{nameOf(e.agent)} · 无动作</div>
          </div>,
        );
      }
      return;
    }
    if (e.type === "round_settled") {
      const elim = e.eliminated;
      if (elim.length > 0) {
        blocks.push(
          <div key={`s-${idx}`} className="settle-event">
            ⚰ <span className="elim">淘汰</span>: {elim.map(nameOf).join("、")}
          </div>,
        );
      }
      return;
    }
    if (e.type === "sim_ended") {
      blocks.push(
        <div key={`end-${idx}`} className="round-divider">
          游戏结束 · {e.reason} · 幸存者: {e.survivors.map(nameOf).join("、") || "无"}
        </div>,
      );
      return;
    }
  });

  return (
    <div className="bubbles" ref={ref}>
      {blocks.length === 0 && <div className="empty">点击 Start 开始</div>}
      {blocks}
    </div>
  );
}
