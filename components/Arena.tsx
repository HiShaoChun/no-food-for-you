"use client";

import { useMemo, useState } from "react";
import type { AgentInstance, GameConfig, SimEvent } from "@/lib/engine/types";
import { EnergyChart } from "./EnergyChart";
import { ChatBubbles } from "./ChatBubbles";
import { TokenMeter } from "./TokenMeter";
import { PublicPledgesPanel } from "./PublicPledgesPanel";
import { DefectionLedger } from "./DefectionLedger";

type Props = {
  config: GameConfig;
  events: SimEvent[];
};

export function Arena({ config, events }: Props): React.ReactElement {
  const [showInnerThought, setShowInnerThought] = useState(false);
  const series = useMemo(() => buildSeries(config.agents, events, config.initial_energy), [
    config.agents,
    config.initial_energy,
    events,
  ]);

  return (
    <main className="arena">
      <div className="chart-wrap">
        <div className="arena-toolbar">
          <label className="researcher-toggle" title="显示 inner_thought (仅研究者)">
            <input
              type="checkbox"
              checked={showInnerThought}
              onChange={(e) => setShowInnerThought(e.target.checked)}
            />
            研究者视角
          </label>
        </div>
        <EnergyChart agents={config.agents} series={series} />
      </div>
      <ChatBubbles
        agents={config.agents}
        events={events}
        initialEnergy={config.initial_energy}
        showInnerThought={showInnerThought}
      />
      <aside className="arena-side">
        <PublicPledgesPanel agents={config.agents} events={events} />
        <DefectionLedger agents={config.agents} events={events} />
      </aside>
      <TokenMeter events={events} />
    </main>
  );
}

function buildSeries(
  agents: AgentInstance[],
  events: SimEvent[],
  initialEnergy: number,
): ({ round: number } & Record<string, number | null>)[] {
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
