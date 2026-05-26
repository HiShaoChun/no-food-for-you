# event-stream — spec delta

## MODIFIED Requirements

### Requirement: Event Type Enumeration
The system SHALL emit one of six event types during a simulation. Every event SHALL include `type`, `sim_id`, and ISO-8601 `t` (timestamp) fields.

The six types are:
- `sim_started` — emitted exactly once at simulation start
- `round_started` — emitted at the start of each round
- `agent_decision_phase` — emitted once per living agent per round (after the decision LLM call settles)
- `agent_response_phase` — emitted once per living agent per round (after the response LLM call settles)
- `round_settled` — emitted once per round after settlement
- `sim_ended` — emitted exactly once at termination

The legacy `agent_decision` event type is RETAINED in the typed union for backwards-compatible JSONL replay BUT SHALL NOT be emitted by new simulations.

#### Scenario: sim_started fields
- **WHEN** a simulation begins
- **THEN** the first event SHALL have `type: "sim_started"` and SHALL include the full `GameConfig` under a `config` field

#### Scenario: agent_decision_phase fields
- **WHEN** an agent's decision phase for round N is processed
- **THEN** an `agent_decision_phase` event SHALL include `round: N`, `agent`, `raw` (LLM raw text), `parsed` (the typed `DecisionAction` or null), optional `parse_error`, optional `policy_truncated: true` (if pledge quota was hit), and optional `tokens: {input, output}`

#### Scenario: agent_response_phase fields
- **WHEN** an agent's response phase for round N is processed
- **THEN** an `agent_response_phase` event SHALL include `round: N`, `agent`, `raw`, `parsed` (the typed `ResponseAction` or null), optional `parse_error`, optional `policy_truncated`, and optional `tokens`

#### Scenario: Decision phase event precedes response phase event in JSONL order
- **WHEN** both events for the same `(round, agent)` are written
- **THEN** the `agent_decision_phase` line SHALL appear BEFORE the `agent_response_phase` line in `runs/<sim_id>.jsonl`

#### Scenario: round_settled fields with pledge ledgers
- **WHEN** round N's settlement completes
- **THEN** a `round_settled` event SHALL include:
  - `round: N`
  - `prev_energies` — map of all agent IDs to integer energies at round start
  - `energies` — post-settlement map; eliminated agents at 0
  - `transfers` — array of `{ from, to, amount, reason? }`
  - `pressure_cost` — integer maintenance fee
  - `eliminated` — list of agent IDs newly eliminated this round
  - `pledges_made_this_round` — array of `Pledge` records (decision + response combined, post-validation)
  - `pledges_settled_this_round` — array of `{ from, to, pledged, actual, status: "kept" | "defected", bonus_paid }` records

#### Scenario: sim_ended fields
- **WHEN** the simulation terminates
- **THEN** a `sim_ended` event SHALL include `reason: "max_rounds" | "all_eliminated" | "one_survivor"` and `survivors` (list of agent IDs with energy > 0)

## ADDED Requirements

### Requirement: Pledge Event Persistence
Every pledge created and every pledge settled SHALL be recoverable from the JSONL archive WITHOUT replaying decisions. Specifically, the `round_settled` event's `pledges_made_this_round` and `pledges_settled_this_round` fields SHALL be SUFFICIENT for downstream tooling (stats aggregator, replay UI) to reconstruct the pledge ledger and defection ledger at any point in time.

#### Scenario: Replay reconstructs public_pledges
- **WHEN** a tool reads all `round_settled` events in order through round N
- **THEN** the union of `pledges_made_this_round` minus the union of `pledges_settled_this_round` (matched by `from`, `to`, and `round_made`) SHALL equal `state.public_pledges` at the start of round N+1

#### Scenario: Replay reconstructs recent_defections
- **WHEN** a tool reads all `round_settled` events in order
- **THEN** the concatenation of `pledges_settled_this_round` entries with `status==="defected"` SHALL equal `state.recent_defections` in append order

#### Scenario: bonus_paid encoded in defection entry
- **WHEN** A1 is the lone defector in round N (default table → +3 bonus)
- **THEN** every `pledges_settled_this_round` entry with `from: "A1"` and `status: "defected"` SHALL have `bonus_paid: 3`

#### Scenario: bonus_paid for kept reflects keep_promise_bonus
- **WHEN** `keep_promise_bonus: 2` and A1 keeps a pledge to A2
- **THEN** the matching `pledges_settled_this_round` entry SHALL have `bonus_paid: 2`

### Requirement: Inner Thought Persistence
The `inner_thought` field SHALL be persisted in the `parsed` payload of `agent_decision_phase` and `agent_response_phase` events, even if empty. The JSONL archive SHALL contain inner_thought verbatim for researcher inspection.

#### Scenario: Inner thought in JSONL
- **WHEN** A1 outputs `inner_thought: "我打算骗他"` in decision phase of round 3
- **THEN** the `agent_decision_phase` line for `(round:3, agent:"A1")` in JSONL SHALL contain `"parsed":{...,"inner_thought":"我打算骗他",...}`

#### Scenario: SSE delivers inner thought to subscribed clients
- **WHEN** the same event is streamed over SSE
- **THEN** the SSE message body SHALL contain the same `inner_thought` text
- (the client UI MAY choose to hide it behind a researcher toggle; that is a UI concern, not an event-stream concern)
