"use client";

import { PROVIDERS, type ProviderKey } from "@/lib/llm/providers";
import type { Availability } from "@/lib/llm/availability";

export function ProviderStatus({ availability }: { availability: Availability | null }): React.ReactElement {
  return (
    <div className="banner">
      <span className="title">No Food For You · Arena</span>
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
              {p}
            </span>
          );
        })}
      </div>
    </div>
  );
}
