"use client";

import type { SimEvent } from "@/lib/engine/types";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function TokenMeter({ events }: { events: SimEvent[] }): React.ReactElement {
  let input = 0;
  let output = 0;
  for (const e of events) {
    if (e.type === "agent_decision" && e.tokens) {
      input += e.tokens.input;
      output += e.tokens.output;
    }
  }
  return (
    <div className="footer">
      <div className="token-meter">
        <span className="group">
          <span className="label">in</span>
          <span className="value">{fmt(input)}</span>
        </span>
        <span className="sep">·</span>
        <span className="group">
          <span className="label">out</span>
          <span className="value">{fmt(output)}</span>
        </span>
        <span className="sep">·</span>
        <span className="group">
          <span className="label">total</span>
          <span className="value">{fmt(input + output)}</span>
        </span>
      </div>
      <div className="events-count">
        <span>{events.length}</span> events
      </div>
    </div>
  );
}
