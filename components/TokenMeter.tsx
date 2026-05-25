"use client";

import type { SimEvent } from "@/lib/engine/types";

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
        Token 累计：input <span>{input}</span> · output <span>{output}</span> · total{" "}
        <span>{input + output}</span>
      </div>
      <div>{events.length} events</div>
    </div>
  );
}
