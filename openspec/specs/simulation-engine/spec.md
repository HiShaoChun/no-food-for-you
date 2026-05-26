# simulation-engine

## Requirements

### Requirement: Round-based State Machine
The system SHALL run simulations as a sequence of discrete rounds. Each round SHALL execute the following phases in order, with no concurrent side effects across rounds.

Phases:
1. **State broadcast** — build a per-agent view containing the full public history since round 1
2. **Decision** — each agent produces ONE action (Request / Respond / No-op); decisions within a single round MAY execute in parallel
3. **Request aggregation** — collect all `Request` actions and route to target inboxes for the next round
4. **Response execution** — apply `Respond` actions (allocations) declared in this round (responding to inbox carried from the previous round)
5. **Settlement** — apply pressure cost, transfer energy, evaluate eliminations

> **MVP simplification (informative):** the engine MAY combine phase ② Decision and phase ④ Response into a single LLM call per agent per round, asking the agent for one action that can be either a request or a response. Inbox routing then introduces a 1-round delay between request and response. This is an implementation choice, not a spec constraint.

#### Scenario: Round phases execute in order
- **WHEN** a round runs
- **THEN** state broadcast SHALL precede decision, decision SHALL precede aggregation, aggregation SHALL precede response, response SHALL precede settlement

#### Scenario: No cross-round concurrency
- **WHEN** round N is executing
- **THEN** no state mutation for round N+1 SHALL occur until round N's settlement completes

### Requirement: Deterministic RNG
The system SHALL inject all randomness through a seeded PRNG. Direct use of `Math.random()` or any unseeded global RNG is forbidden in engine code.

#### Scenario: Same seed produces identical sequence
- **WHEN** two simulations are started with identical `GameConfig` and identical `master_seed`
- **AND** all agents are stub agents producing deterministic outputs
- **THEN** the resulting JSONL event streams SHALL be byte-identical

#### Scenario: RNG used for request delivery ordering
- **WHEN** multiple `Request` actions target the same agent in one round
- **THEN** their order in the target's inbox SHALL be determined by the seeded RNG
- **AND** the order SHALL NOT depend on agent decision wall-clock latency

### Requirement: Integer Energy Invariant
The system SHALL store and transfer energy only as integers. No fractional energy SHALL exist in any persisted state.

#### Scenario: Allocation amounts are integers
- **WHEN** an agent produces a `Respond` action
- **THEN** every `allocations[i].amount` SHALL be a positive integer
- **AND** a non-integer amount SHALL cause that allocation entry to be dropped and a `parse_error` event emitted

### Requirement: Pressure Curve
The system SHALL deduct a per-round maintenance cost from each living agent at settlement, computed from the configured pressure curve.

#### Scenario: Constant pressure
- **WHEN** `pressure.type === "constant"` with `amount = 1`
- **THEN** every living agent's energy SHALL decrease by 1 at each settlement

#### Scenario: Linear pressure
- **WHEN** `pressure.type === "linear"` with `start = 1`, `step = 1`
- **THEN** at round t (1-indexed), each living agent SHALL lose `start + step * (t - 1)` energy at settlement

#### Scenario: Step pressure
- **WHEN** `pressure.type === "step"` with `thresholds = [10, 20]`
- **THEN** rounds 1–10 SHALL cost 1, rounds 11–20 SHALL cost 2, rounds 21+ SHALL cost 3

### Requirement: Allocation Policies
The system SHALL enforce one of three allocation policies on each `Respond` action.

#### Scenario: fully_free policy
- **WHEN** `allocation_policy.type === "fully_free"`
- **THEN** the only constraint SHALL be that the sum of allocated amounts ≤ the responder's current energy

#### Scenario: capped policy
- **WHEN** `allocation_policy.type === "capped"` with `cap = 5`
- **THEN** the sum of allocated amounts in a single response SHALL NOT exceed 5
- **AND** if the agent returns a sum > 5, the engine SHALL proportionally scale down each amount to fit and emit a `policy_truncated` flag in the decision event

#### Scenario: proportional policy
- **WHEN** `allocation_policy.type === "proportional"` AND the responder received N requests
- **THEN** the engine SHALL ignore agent-supplied `amount` values in `Respond` actions
- **AND** SHALL instead distribute `min(self_energy, sum_of_requested_amounts)` across requesters proportional to each request's `amount`

### Requirement: Elimination Rule
The system SHALL mark an agent as eliminated at settlement if and only if its energy drops to ≤ 0 after that round's transfers and pressure deduction.

#### Scenario: Energy hits zero
- **WHEN** an agent's energy reaches exactly 0 after settlement
- **THEN** the agent SHALL be eliminated
- **AND** SHALL NOT participate in subsequent rounds
- **AND** SHALL NOT receive incoming allocations after elimination

#### Scenario: Transient negative resolved within round
- **WHEN** an agent's intermediate balance goes negative during a single round's calculations
- **AND** transfers within the same round bring it back to ≥ 1 before settlement check
- **THEN** the agent SHALL survive
  - (Note: this scenario is theoretical because settlement runs once at end-of-round, but the rule is stated for completeness)

### Requirement: Termination Conditions
The system SHALL end a simulation when any of the following occur. The ended state SHALL emit a `sim_ended` event with the matching reason.

#### Scenario: Reached max_rounds
- **WHEN** round `max_rounds` settles
- **THEN** the simulation SHALL terminate with reason `"max_rounds"`

#### Scenario: All agents eliminated
- **WHEN** settlement leaves zero living agents
- **THEN** the simulation SHALL terminate with reason `"all_eliminated"`

#### Scenario: Single survivor
- **WHEN** settlement leaves exactly one living agent
- **THEN** the simulation SHALL terminate with reason `"one_survivor"`

### Requirement: Engine is Stateless Across Simulations
The engine SHALL NOT share mutable state between distinct simulations. Each `runSimulation` call SHALL operate on its own `GameState` instance.

#### Scenario: Concurrent simulations are independent
- **WHEN** two simulations run concurrently with the same `master_seed`
- **THEN** their outputs SHALL be identical to each running in isolation

### Requirement: Round Settlement Emits Reconcilable Detail
The system SHALL emit a `round_settled` event at the end of every round that contains sufficient detail for a frontend to reconstruct the round's outcome WITHOUT replaying decisions.

Fields:
- `round` — the round number that just settled
- `prev_energies` — every registered agent's energy at round-start (before transfers and pressure deduction)
- `energies` — every registered agent's energy at round-end (after settlement); eliminated agents appear at 0
- `transfers` — array of `{ from, to, amount, reason? }` records describing every actual integer energy transfer applied this round (already truncated/scaled per allocation policy). `reason` is optional and carries the responder's stated reason for that allocation (if the agent provided one).
- `pressure_cost` — the integer maintenance fee deducted from each living agent this round
- `eliminated` — agent IDs newly eliminated this round (not the cumulative set)
- `t` — ISO-8601 timestamp

#### Scenario: Settled event includes prev_energies snapshot
- **WHEN** a round settles
- **THEN** `prev_energies` SHALL equal the energy map as it was at the start of this round (i.e., the `energies` field of the previous `round_settled` event, or `initial_energy` for all agents on round 1)

#### Scenario: Transfers reflect actual policy-applied amounts
- **WHEN** an agent declared `{"allocations":[{"to":"A2","amount":10}]}` but the `capped` policy with `cap=2` is in effect
- **THEN** `transfers` SHALL contain `{ from: "<responder>", to: "A2", amount: 2 }`
- **AND** SHALL NOT contain the agent-declared value of 10

#### Scenario: No transfers means empty array
- **WHEN** a round had no successful allocations
- **THEN** `transfers` SHALL be `[]` (never `undefined` or missing)

#### Scenario: Transfer carries allocation reason when present
- **WHEN** an agent allocated `{"to":"A2","amount":3,"reason":"看你还能撑两轮"}` and the engine applied it
- **THEN** the matching `transfers` entry SHALL include `reason: "看你还能撑两轮"`

#### Scenario: Transfer without reason
- **WHEN** an agent allocated `{"to":"A2","amount":3}` (no reason)
- **THEN** the matching `transfers` entry SHALL NOT include a `reason` field (or SHALL have it as undefined)

#### Scenario: pressure_cost reflects the configured curve at this round
- **WHEN** `pressure.type === "linear"` with `start=1, step=1` and round is 5
- **THEN** `pressure_cost` SHALL equal 5

#### Scenario: Eliminated agent at zero appears in energies
- **WHEN** an agent is eliminated this round
- **THEN** `eliminated` SHALL list that agent's ID
- **AND** `energies[<id>]` SHALL equal 0

### Requirement: Reason Propagates Into Subsequent Round Views
The system SHALL include the `reason` of each transfer (if present) in the per-agent view that the next round's decision phase receives, so agents can incorporate prior allocation reasons into their reasoning.

#### Scenario: Reason appears in history for next round's view
- **WHEN** in round N agent A1 allocates `{to:"A2",amount:2,reason:"看你能撑两轮"}` (applied)
- **AND** the simulation continues to round N+1
- **THEN** the view passed to agents in round N+1 SHALL surface the transfer entry from round N with its reason
