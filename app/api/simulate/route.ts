import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { GameConfigSchema } from "@/lib/config-schema";
import { isProviderAvailable } from "@/lib/llm/availability";
import { getModel } from "@/lib/llm/providers";
import { createSim, emitEvent } from "@/lib/registry";
import { runSimulation } from "@/lib/engine/round";
import { makeLlmAgent } from "@/lib/agents/llm-agent";
import type { AgentRuntime } from "@/lib/engine/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = GameConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const config = parsed.data;

  // Check that every agent's provider is configured
  for (const a of config.agents) {
    const { provider } = getModel(a.model_key);
    if (!isProviderAvailable(provider)) {
      return NextResponse.json(
        { error: `provider ${provider} not configured` },
        { status: 400 },
      );
    }
  }

  // Verify agent IDs are unique
  const ids = new Set(config.agents.map((a) => a.id));
  if (ids.size !== config.agents.length) {
    return NextResponse.json({ error: "duplicate_agent_ids" }, { status: 400 });
  }

  const sim_id = randomUUID();
  await createSim(sim_id);

  const agents: AgentRuntime[] = config.agents.map((a) =>
    makeLlmAgent({
      id: a.id,
      model_key: a.model_key,
      shared_system_prompt: config.shared_system_prompt,
    }),
  );

  // Fire-and-forget: run the simulation in the background.
  // Emit errors as a synthetic sim_ended event with reason all_eliminated as fallback.
  void runSimulation(config, {
    sim_id,
    agents,
    emit: (e) => {
      // Best-effort; we don't want to block the engine on disk IO
      void emitEvent(sim_id, e);
    },
  }).catch(async (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    await emitEvent(sim_id, {
      type: "sim_ended",
      sim_id,
      reason: "all_eliminated",
      survivors: [],
      t: new Date().toISOString(),
    });
    console.error(`[sim ${sim_id}] runSimulation failed:`, msg);
  });

  return NextResponse.json({ sim_id });
}
