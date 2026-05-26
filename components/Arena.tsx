"use client";

import { useMemo } from "react";
import type { AgentInstance, GameConfig, SimEvent } from "@/lib/engine/types";
import { EnergyChart } from "./EnergyChart";
import { ChatBubbles } from "./ChatBubbles";
import { TokenMeter } from "./TokenMeter";

type Props = {
  config: GameConfig;
  events: SimEvent[];
};

export function Arena({ config, events }: Props): React.ReactElement {
  const series = useMemo(() => buildSeries(config.agents, events, config.initial_energy), [
    config.agents,
    config.initial_energy,
    events,
  ]);

  return (
    <main className="arena">
      <div className="chart-wrap">
        <EnergyChart agents={config.agents} series={series} />
      </div>
      <ChatBubbles
        agents={config.agents}
        events={events}
        initialEnergy={config.initial_energy}
      />
      <TokenMeter events={events} />
    </main>
  );
}

function buildSeries(
  agents: AgentInstance[],
  events: SimEvent[],
  initialEnergy: number,
): ({ round: number } & Record<string, number | null>)[] {
  // Start with round 0 = initial energy
  const points: ({ round: number } & Record<string, number | null>)[] = [];
  const initial: { round: number } & Record<string, number | null> = { round: 0 };
  for (const a of agents) initial[a.id] = initialEnergy;
  points.push(initial);

  const eliminatedSet = new Set<string>();
  for (const e of events) {
    if (e.type !== "round_settled") continue;
    const p: { round: number } & Record<string, number | null> = { round: e.round };
    for (const a of agents) {
      if (eliminatedSet.has(a.id)) {
        p[a.id] = null;
      } else {
        p[a.id] = e.energies[a.id] ?? 0;
      }
    }
    for (const id of e.eliminated) eliminatedSet.add(id);
    points.push(p);
  }
  return points;
}
