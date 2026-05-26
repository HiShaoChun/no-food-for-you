# simulation-engine — spec delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Reason Propagates Into Subsequent Round Views
The system SHALL include the `reason` of each transfer (if present) in the per-agent view that the next round's decision phase receives, so agents can incorporate prior allocation reasons into their reasoning.

#### Scenario: Reason appears in history for next round's view
- **WHEN** in round N agent A1 allocates `{to:"A2",amount:2,reason:"看你能撑两轮"}` (applied)
- **AND** the simulation continues to round N+1
- **AND** info_mode allows N to be visible
- **THEN** the view passed to agents in round N+1 SHALL surface the transfer entry from round N with its reason
