import type { ModelKey } from "@/lib/llm/providers";
import type { DefectionRecord, Pledge, PledgeSettlement } from "./pledge";

// ───── Config ─────

export type AgentInstance = {
  id: string; // "A1" / "A2" / ...
  display_name: string;
  model_key: ModelKey;
};

export type PressureCurve =
  | { type: "constant"; amount: number }
  | { type: "linear"; start: number; step: number }
  | { type: "step"; thresholds: number[] };

export type AllocationPolicy =
  | { type: "fully_free" }
  | { type: "capped"; cap: number }
  | { type: "proportional" };

export type PledgesConfig = {
  enabled: boolean;
  betrayal_bonus_table: number[];
  keep_promise_bonus: number;
};

export type GameConfig = {
  agents: AgentInstance[];
  shared_system_prompt: string;
  initial_energy: number;
  max_rounds: number;
  pressure: PressureCurve;
  allocation_policy: AllocationPolicy;
  master_seed: number;
  pledges: PledgesConfig;
};

// ───── Allocation (shared by response action & policy layer) ─────

export type Allocation = {
  to: string;
  amount: number;
  reason?: string;
};

// ───── Pledge payload from agent (engine injects from/round_made/due_round) ─────

export type PledgeRequest = {
  to: string;
  amount: number;
};

// ───── Phase actions ─────

export type DecisionAction = {
  phase: "decision";
  requests: { target: string; message: string }[];
  pledges: PledgeRequest[];
  inner_thought: string;
};

export type ResponseAction = {
  phase: "response";
  allocations: Allocation[];
  pledges: PledgeRequest[];
  inner_thought: string;
};

export type PhaseAction = DecisionAction | ResponseAction;

// ───── Inbox message (delivered to response phase of same round) ─────

export type InboxMessage = {
  from: string;
  round: number;
  message: string;
};

// ───── Per-agent views (phase-specific) ─────

export type AgentViewBase = {
  agent_id: string;
  round: number;
  max_rounds: number;
  self_energy: number;
  all_energies: Record<string, number>;
  history: HistoryEntry[];
  pressure_description: string;
  public_pledges: Pledge[];
  pending_pledges: Pledge[];
  recent_defections: DefectionRecord[];
};

export type DecisionView = AgentViewBase & {
  phase: "decision";
};

export type ResponseView = AgentViewBase & {
  phase: "response";
  inbox: InboxMessage[];
};

export type AgentView = DecisionView | ResponseView;

export type HistoryEntry = {
  round: number;
  events: HistoryEvent[];
};

export type HistoryEvent =
  | { kind: "request"; from: string; to: string; message: string }
  | { kind: "transfer"; from: string; to: string; amount: number; reason?: string };

// ───── Engine state (lives across rounds) ─────

export type GameState = {
  config: GameConfig;
  round: number; // next round to run (starts at 1)
  energies: Record<string, number>;
  eliminated: Set<string>;
  history: HistoryEntry[]; // append-only history of public events
  public_pledges: Pledge[]; // active pledges (not yet settled)
  recent_defections: DefectionRecord[]; // append-only ledger
  rng: () => number; // seeded PRNG
};

// ───── Events (what gets emitted to SSE/JSONL) ─────

export type RoundSettledEvent = {
  type: "round_settled";
  sim_id: string;
  round: number;
  prev_energies: Record<string, number>;
  energies: Record<string, number>;
  transfers: Array<{ from: string; to: string; amount: number; reason?: string }>;
  pressure_cost: number;
  eliminated: string[];
  pledges_made_this_round: Pledge[];
  pledges_settled_this_round: PledgeSettlement[];
  t: string;
};

export type AgentDecisionStartedEvent = {
  type: "agent_decision_started";
  sim_id: string;
  round: number;
  agent: string;
  phase: "decision";
  t: string;
};

export type AgentResponseStartedEvent = {
  type: "agent_response_started";
  sim_id: string;
  round: number;
  agent: string;
  phase: "response";
  t: string;
};

export type AgentDecisionPhaseEvent = {
  type: "agent_decision_phase";
  sim_id: string;
  round: number;
  agent: string;
  raw: string;
  parsed: DecisionAction | null;
  parse_error?: string;
  policy_truncated?: boolean;
  tokens?: { input: number; output: number };
  t: string;
};

export type AgentResponsePhaseEvent = {
  type: "agent_response_phase";
  sim_id: string;
  round: number;
  agent: string;
  raw: string;
  parsed: ResponseAction | null;
  parse_error?: string;
  policy_truncated?: boolean;
  tokens?: { input: number; output: number };
  t: string;
};

export type SimEvent =
  | { type: "sim_started"; sim_id: string; config: GameConfig; t: string }
  | { type: "round_started"; sim_id: string; round: number; t: string }
  | AgentDecisionStartedEvent
  | AgentResponseStartedEvent
  | AgentDecisionPhaseEvent
  | AgentResponsePhaseEvent
  | RoundSettledEvent
  | {
      type: "sim_ended";
      sim_id: string;
      reason: "max_rounds" | "all_eliminated" | "one_survivor";
      survivors: string[];
      t: string;
    };

export type EventType = SimEvent["type"];

// ───── Agent runtime contract (two-phase) ─────

export type PhaseResult<P extends PhaseAction> = {
  raw: string;
  parsed: P | null;
  parse_error?: string;
  policy_truncated?: boolean;
  tokens?: { input: number; output: number };
};

export type DecisionResult = PhaseResult<DecisionAction>;
export type ResponseResult = PhaseResult<ResponseAction>;

export type AgentRuntime = {
  id: string;
  decide_phase: (view: DecisionView) => Promise<DecisionResult>;
  respond_phase: (view: ResponseView) => Promise<ResponseResult>;
};

// Re-export pledge module types for convenience
export type { Pledge, DefectionRecord, PledgeSettlement } from "./pledge";
