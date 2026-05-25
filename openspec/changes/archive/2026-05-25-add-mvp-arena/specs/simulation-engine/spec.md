# simulation-engine — spec delta

## ADDED Requirements

### Requirement: Round-based State Machine
The system SHALL run simulations as a sequence of discrete rounds. Each round SHALL execute the following phases in order, with no concurrent side effects across rounds.

Phases:
1. **State broadcast** — build a per-agent view based on the information mode
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

### Requirement: Information Modes
The system SHALL build each agent's per-round view according to the configured information mode.

#### Scenario: Open mode
- **WHEN** `info_mode.type === "open"`
- **THEN** the view SHALL include the full request/allocation history of all agents since round 1

#### Scenario: Blind mode
- **WHEN** `info_mode.type === "blind"`
- **THEN** the view SHALL include only current-round energies and the current inbox; no historical events

#### Scenario: Partial mode
- **WHEN** `info_mode.type === "partial"` with `k = 3`
- **THEN** the view SHALL include events from the most recent 3 rounds only

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
