# event-stream — delta

## MODIFIED Requirements

### Requirement: Event Type Enumeration
The system SHALL emit one of eight event types during a simulation. Every event SHALL include `type`, `sim_id`, and ISO-8601 `t` (timestamp) fields.

The eight types are:
- `sim_started` — emitted exactly once at simulation start
- `round_started` — emitted at the start of each round
- `agent_decision_started` — emitted once per living agent per round, BEFORE that agent's decision LLM call is dispatched
- `agent_decision_phase` — emitted once per living agent per round, AS SOON AS that agent's decision LLM call resolves
- `agent_response_started` — emitted once per living agent per round, BEFORE that agent's response LLM call is dispatched
- `agent_response_phase` — emitted once per living agent per round, AS SOON AS that agent's response LLM call resolves
- `round_settled` — emitted once per round after settlement, AFTER every `agent_response_phase` event for that round
- `sim_ended` — emitted exactly once at termination

The legacy `agent_decision` event type is REMOVED. It SHALL NOT appear in the typed union and SHALL NOT be emitted by any new simulation. The project is in pre-stable development; older JSONL files containing this type are not required to render.

#### Scenario: sim_started fields
- **WHEN** a simulation begins
- **THEN** the first event SHALL have `type: "sim_started"` and SHALL include the full `GameConfig` under a `config` field

#### Scenario: agent_decision_started fields
- **WHEN** the decision phase of round N begins for a living agent A1
- **THEN** an `agent_decision_started` event SHALL be emitted containing `round: N`, `agent: "A1"`, and `phase: "decision"`

#### Scenario: agent_response_started fields
- **WHEN** the response phase of round N begins for a living agent A1
- **THEN** an `agent_response_started` event SHALL be emitted containing `round: N`, `agent: "A1"`, and `phase: "response"`

#### Scenario: agent_decision_phase fields
- **WHEN** an agent's decision phase LLM call for round N resolves
- **THEN** an `agent_decision_phase` event SHALL include `round: N`, `agent`, `raw`, `parsed` (the typed `DecisionAction` or null), optional `parse_error`, optional `policy_truncated`, and optional `tokens: {input, output}`

#### Scenario: agent_response_phase fields
- **WHEN** an agent's response phase LLM call for round N resolves
- **THEN** an `agent_response_phase` event SHALL include `round: N`, `agent`, `raw`, `parsed` (the typed `ResponseAction` or null), optional `parse_error`, optional `policy_truncated`, and optional `tokens`

#### Scenario: Started event precedes phase event for the same agent
- **WHEN** both `agent_decision_started` and `agent_decision_phase` events for the same `(round, agent)` are emitted
- **THEN** the `agent_decision_started` line SHALL appear BEFORE the `agent_decision_phase` line in `runs/<sim_id>.jsonl`
- **AND** the same SHALL hold for `agent_response_started` vs `agent_response_phase`

#### Scenario: Decision phase event precedes response phase event in JSONL order
- **WHEN** both events for the same `(round, agent)` are written
- **THEN** the `agent_decision_phase` line SHALL appear BEFORE the `agent_response_started` line in `runs/<sim_id>.jsonl`
- **AND** the `agent_decision_phase` line SHALL also appear BEFORE the `agent_response_phase` line

#### Scenario: round_settled fields
- **WHEN** round N's settlement completes
- **THEN** a `round_settled` event SHALL include:
  - `round: N`
  - `prev_energies` — map of all agent IDs to integer energies at round start
  - `energies` — post-settlement map; eliminated agents at 0
  - `transfers` — array of `{ from, to, amount, reason? }`
  - `pressure_cost` — integer maintenance fee
  - `eliminated` — agent IDs newly eliminated this round
  - `pledges_made_this_round` — array of `Pledge` records (post-validation)
  - `pledges_settled_this_round` — array of `{ from, to, pledged, actual, status: "kept" | "defected", bonus_paid }`

#### Scenario: sim_ended fields
- **WHEN** the simulation terminates
- **THEN** a `sim_ended` event SHALL include `reason: "max_rounds" | "all_eliminated" | "one_survivor"` and `survivors` (list of agent IDs with energy > 0)

## ADDED Requirements

### Requirement: Per-agent Phase Start Event
The system SHALL emit `agent_decision_started` and `agent_response_started` events to allow the UI to render a "thinking" placeholder bubble as soon as a phase begins, well before the LLM call resolves. These events SHALL be small and contain no LLM output (no `raw`, no `parsed`, no `tokens`).

Event shapes:
```ts
type AgentDecisionStartedEvent = {
  type: "agent_decision_started";
  sim_id: string;
  round: number;
  agent: string;
  phase: "decision";
  t: string;
};

type AgentResponseStartedEvent = {
  type: "agent_response_started";
  sim_id: string;
  round: number;
  agent: string;
  phase: "response";
  t: string;
};
```

#### Scenario: One started event per living agent per phase
- **WHEN** round N's decision phase begins for K living agents
- **THEN** exactly K `agent_decision_started` events SHALL be emitted for round N — one per living agent
- **AND** the same property SHALL hold for `agent_response_started` in the response phase

#### Scenario: Started event carries phase discriminator
- **WHEN** an `agent_decision_started` event is emitted
- **THEN** its `phase` field SHALL be the literal string `"decision"`
- **AND** for `agent_response_started`, the `phase` field SHALL be the literal string `"response"`

#### Scenario: Started event contains no LLM payload
- **WHEN** an `agent_*_started` event is emitted
- **THEN** the event object SHALL NOT contain `raw`, `parsed`, `tokens`, `parse_error`, or `policy_truncated` fields

### Requirement: Per-agent Emission Timing
Within a single phase, the engine SHALL emit each agent's `agent_decision_phase` (resp. `agent_response_phase`) event AS SOON AS that agent's LLM call resolves. The order in which the per-agent phase events appear in the SSE stream and the JSONL archive SHALL reflect the actual completion order of the underlying LLM calls. The engine SHALL NOT collect all agents' phase events and emit them as a batch at the end of the phase.

Across phases, strict serialization is preserved: every per-agent phase event within phase P SHALL precede every per-agent started/phase event for phase P+1, and SHALL precede `round_settled`.

#### Scenario: Fast agent emits before slow agent
- **WHEN** round N's decision phase dispatches LLM calls for A1 and A2 concurrently AND A1's call resolves before A2's
- **THEN** A1's `agent_decision_phase` event SHALL appear before A2's `agent_decision_phase` event in `runs/<sim_id>.jsonl` AND in SSE delivery order
- **AND** A1's `agent_decision_phase` event SHALL appear before any `agent_response_started` event for round N

#### Scenario: All decision phase events precede any response started event
- **WHEN** round N has K living agents
- **THEN** all K `agent_decision_phase` events SHALL appear before ANY `agent_response_started` event for round N

#### Scenario: All response phase events precede round_settled
- **WHEN** round N has K living agents
- **THEN** all K `agent_response_phase` events SHALL appear before the `round_settled` event for round N

#### Scenario: Failed LLM call still emits a phase event
- **WHEN** A1's decision LLM call rejects (network error, HTTP 5xx)
- **THEN** the engine SHALL still emit an `agent_decision_phase` event for A1 in this phase with `parsed: null` and a `parse_error` describing the failure
- **AND** the engine SHALL NOT skip A1's phase event (a skip would block the UI placeholder forever)
