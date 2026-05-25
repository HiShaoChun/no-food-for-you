"use client";

import { PROVIDERS, type ProviderKey } from "@/lib/llm/providers";
import type { Availability } from "@/lib/llm/availability";

export type SimStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ended"; reason: string };

type Props = {
  availability: Availability | null;
  status?: SimStatus;
};

function statusLabel(s: SimStatus): string {
  switch (s.kind) {
    case "idle":
      return "Idle";
    case "running":
      return "Running";
    case "ended":
      return `Ended · ${s.reason}`;
  }
}

export function ProviderStatus({
  availability,
  status = { kind: "idle" },
}: Props): React.ReactElement {
  return (
    <div className="banner">
      <span className="brand">
        <span className="brand-dot" aria-hidden />
        <span>No Food For You · Arena</span>
      </span>
      <span className={`sim-status ${status.kind}`} title={statusLabel(status)}>
        <span className="dot" aria-hidden />
        {statusLabel(status)}
      </span>
      <div className="pills">
        {(Object.keys(PROVIDERS) as ProviderKey[]).map((p) => {
          const ok = availability?.[p] ?? false;
          const cfg = PROVIDERS[p];
          return (
            <span
              key={p}
              className={`pill ${ok ? "on" : "off"}`}
              title={ok ? `已配置 ${cfg.envKey}` : `请在 .env 配置 ${cfg.envKey} 与 ${cfg.envUrl}`}
            >
              <span className="pill-dot" aria-hidden />
              {p}
            </span>
          );
        })}
      </div>
    </div>
  );
}
