import type { ModelKey } from "@/lib/llm/providers";

// ───── Config ─────

export type AgentInstance = {
  id: string; // "A1" / "A2" / ...
  display_name: string;
  model_key: ModelKey;
};

export type InformationMode =
  | { type: "open" }
  | { type: "blind" }
  | { type: "partial"; k: number };

export type PressureCurve =
  | { type: "constant"; amount: number }
  | { type: "linear"; start: number; step: number }
  | { type: "step"; thresholds: number[] };

export type AllocationPolicy =
  | { type: "fully_free" }
  | { type: "capped"; cap: number }
  | { type: "proportional" };

export type GameConfig = {
  agents: AgentInstance[];
  shared_system_prompt: string;
  initial_energy: number;
  max_rounds: number;
  max_requests_per_round: number;
  info_mode: InformationMode;
  pressure: PressureCurve;
  allocation_policy: AllocationPolicy;
  master_seed: number;
};

// ───── Actions (what an agent returns each round) ─────

export type RequestAction = {
  action: "request";
  target: string;
  message: string;
};

export type Allocation = {
  to: string;
  amount: number;
};

export type RespondAction = {
  action: "respond";
  allocations: Allocation[];
};

export type NoopAction = {
  action: "noop";
};

export type AgentAction = RequestAction | RespondAction | NoopAction;

// ───── Inbox message (carried into next round) ─────

export type InboxMessage = {
  from: string;
  round: number;
  message: string;
};

// ───── Per-round view (what an agent sees before deciding) ─────

export type AgentView = {
  agent_id: string;
  round: number;
  max_rounds: number;
  self_energy: number;
  all_energies: Record<string, number>;
  inbox: InboxMessage[];
  history: HistoryEntry[]; // filtered by info_mode
  pressure_description: string; // human-readable for prompt
};

export type HistoryEntry = {
  round: number;
  events: HistoryEvent[];
};

export type HistoryEvent =
  | { kind: "request"; from: string; to: string; message: string }
  | { kind: "transfer"; from: string; to: string; amount: number };

// ───── Engine state (lives across rounds) ─────

export type GameState = {
  config: GameConfig;
  round: number; // next round to run (starts at 1)
  energies: Record<string, number>;
  eliminated: Set<string>;
  inboxes: Record<string, InboxMessage[]>; // pending requests delivered next round
  history: HistoryEntry[]; // append-only history of public events
  rng: () => number; // seeded PRNG
};

// ───── Events (what gets emitted to SSE/JSONL) ─────

export type SimEvent =
  | { type: "sim_started"; sim_id: string; config: GameConfig; t: string }
  | { type: "round_started"; sim_id: string; round: number; t: string }
  | {
      type: "agent_decision";
      sim_id: string;
      round: number;
      agent: string;
      raw: string;
      parsed: AgentAction | null;
      parse_error?: string;
      policy_truncated?: boolean;
      tokens?: { input: number; output: number };
      t: string;
    }
  | {
      type: "round_settled";
      sim_id: string;
      round: number;
      prev_energies: Record<string, number>; // round-start snapshot
      energies: Record<string, number>; // post-settlement
      transfers: Array<{ from: string; to: string; amount: number }>; // policy-applied
      pressure_cost: number; // maintenance fee deducted from each living agent
      eliminated: string[]; // newly eliminated this round
      t: string;
    }
  | {
      type: "sim_ended";
      sim_id: string;
      reason: "max_rounds" | "all_eliminated" | "one_survivor";
      survivors: string[];
      t: string;
    };

export type EventType = SimEvent["type"];

// ───── Round runner inputs ─────

export type AgentDecisionResult = {
  raw: string;
  parsed: AgentAction | null;
  parse_error?: string;
  tokens?: { input: number; output: number };
};

export type AgentRuntime = {
  id: string;
  decide: (view: AgentView) => Promise<AgentDecisionResult>;
};
