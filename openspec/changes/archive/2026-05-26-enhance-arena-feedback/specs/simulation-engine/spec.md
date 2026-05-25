# simulation-engine — spec delta

## MODIFIED Requirements

### Requirement: Round Settlement Emits Reconcilable Detail
The system SHALL emit a `round_settled` event at the end of every round that contains sufficient detail for a frontend to reconstruct the round's outcome WITHOUT replaying decisions.

Fields:
- `round` — the round number that just settled
- `prev_energies` — every registered agent's energy at round-start (before transfers and pressure deduction)
- `energies` — every registered agent's energy at round-end (after settlement); eliminated agents appear at 0
- `transfers` — array of `{ from, to, amount }` records describing every actual integer energy transfer applied this round (already truncated/scaled per allocation policy)
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

#### Scenario: pressure_cost reflects the configured curve at this round
- **WHEN** `pressure.type === "linear"` with `start=1, step=1` and round is 5
- **THEN** `pressure_cost` SHALL equal 5

#### Scenario: Eliminated agent at zero appears in energies
- **WHEN** an agent is eliminated this round
- **THEN** `eliminated` SHALL list that agent's ID
- **AND** `energies[<id>]` SHALL equal 0
