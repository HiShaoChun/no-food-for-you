"use client";

import { useEffect, useRef, useState } from "react";
import { ProviderStatus } from "@/components/ProviderStatus";
import { ConfigPanel } from "@/components/ConfigPanel";
import { Arena } from "@/components/Arena";
import type { Availability } from "@/lib/llm/availability";
import type { GameConfig, SimEvent } from "@/lib/engine/types";
import { DEFAULT_SHARED_SYSTEM_PROMPT } from "@/lib/agents/prompt-template";
import { MODEL_KEYS, getModel } from "@/lib/llm/providers";

function pickInitialModel(av: Availability | null): typeof MODEL_KEYS[number] {
  if (!av) return MODEL_KEYS[0]!;
  for (const k of MODEL_KEYS) {
    if (av[getModel(k).provider]) return k;
  }
  return MODEL_KEYS[0]!;
}

function defaultConfig(av: Availability | null): GameConfig {
  const m = pickInitialModel(av);
  return {
    agents: [
      { id: "A1", display_name: `${m} #1`, model_key: m },
      { id: "A2", display_name: `${m} #2`, model_key: m },
      { id: "A3", display_name: `${m} #3`, model_key: m },
    ],
    shared_system_prompt: DEFAULT_SHARED_SYSTEM_PROMPT,
    initial_energy: 10,
    max_rounds: 30,
    max_requests_per_round: 1,
    info_mode: { type: "partial", k: 3 },
    pressure: { type: "constant", amount: 1 },
    allocation_policy: { type: "fully_free" },
    master_seed: 42,
  };
}

export default function Page(): React.ReactElement {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [config, setConfig] = useState<GameConfig>(() => defaultConfig(null));
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [simId, setSimId] = useState<string | null>(null);
  const seenKeys = useRef<Set<string>>(new Set());

  // Load availability + reset default config once
  useEffect(() => {
    let cancelled = false;
    fetch("/api/availability")
      .then((r) => r.json())
      .then((data: { availability: Availability }) => {
        if (cancelled) return;
        setAvailability(data.availability);
        setConfig((prev) => {
          // If current default agents reference disabled providers, rewrite them
          const needsRewrite = prev.agents.some(
            (a) => !data.availability[getModel(a.model_key).provider],
          );
          return needsRewrite ? defaultConfig(data.availability) : prev;
        });
      })
      .catch(() => {
        // If the endpoint fails, leave availability null (all enabled)
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function startSim(): Promise<void> {
    setEvents([]);
    seenKeys.current = new Set();
    setRunning(true);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const body = await res.text();
        alert(`启动失败：${body}`);
        setRunning(false);
        return;
      }
      const data = (await res.json()) as { sim_id: string };
      setSimId(data.sim_id);
    } catch (e) {
      alert(`启动失败：${e instanceof Error ? e.message : String(e)}`);
      setRunning(false);
    }
  }

  // SSE subscription
  useEffect(() => {
    if (!simId) return;
    const es = new EventSource(`/api/events/${simId}`);
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as SimEvent;
        const key = dedupeKey(ev);
        if (seenKeys.current.has(key)) return;
        seenKeys.current.add(key);
        setEvents((prev) => [...prev, ev]);
        if (ev.type === "sim_ended") {
          es.close();
          setRunning(false);
        }
      } catch {
        // ignore malformed
      }
    };
    es.onerror = () => {
      es.close();
      setRunning(false);
    };
    return () => {
      es.close();
    };
  }, [simId]);

  return (
    <>
      <div className="page">
        <ProviderStatus availability={availability} />
        <ConfigPanel
          config={config}
          availability={availability}
          running={running}
          onChange={setConfig}
          onStart={() => void startSim()}
        />
        <Arena config={config} events={events} />
      </div>
    </>
  );
}

function dedupeKey(e: SimEvent): string {
  switch (e.type) {
    case "agent_decision":
      return `${e.type}:${e.round}:${e.agent}`;
    case "round_started":
    case "round_settled":
      return `${e.type}:${e.round}`;
    case "sim_started":
    case "sim_ended":
      return e.type;
  }
}
