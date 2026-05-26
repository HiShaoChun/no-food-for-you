"use client";

import type { SimEvent } from "@/lib/engine/types";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function TokenMeter({ events }: { events: SimEvent[] }): React.ReactElement {
  let decisionIn = 0;
  let decisionOut = 0;
  let responseIn = 0;
  let responseOut = 0;
  let legacyIn = 0;
  let legacyOut = 0;
  for (const e of events) {
    if (e.type === "agent_decision_phase" && e.tokens) {
      decisionIn += e.tokens.input;
      decisionOut += e.tokens.output;
    } else if (e.type === "agent_response_phase" && e.tokens) {
      responseIn += e.tokens.input;
      responseOut += e.tokens.output;
    } else if (e.type === "agent_decision" && e.tokens) {
      legacyIn += e.tokens.input;
      legacyOut += e.tokens.output;
    }
  }
  const totalIn = decisionIn + responseIn + legacyIn;
  const totalOut = decisionOut + responseOut + legacyOut;
  return (
    <div className="footer">
      <div className="token-meter">
        <span className="group" title="决策阶段">
          <span className="label">dec</span>
          <span className="value">
            {fmt(decisionIn)}/{fmt(decisionOut)}
          </span>
        </span>
        <span className="sep">·</span>
        <span className="group" title="响应阶段">
          <span className="label">res</span>
          <span className="value">
            {fmt(responseIn)}/{fmt(responseOut)}
          </span>
        </span>
        <span className="sep">·</span>
        <span className="group">
          <span className="label">total</span>
          <span className="value">
            {fmt(totalIn)}/{fmt(totalOut)}
          </span>
        </span>
        <span className="sep">·</span>
        <span className="group">
          <span className="label">sum</span>
          <span className="value">{fmt(totalIn + totalOut)}</span>
        </span>
      </div>
      <div className="events-count">
        <span>{events.length}</span> events
      </div>
    </div>
  );
}
