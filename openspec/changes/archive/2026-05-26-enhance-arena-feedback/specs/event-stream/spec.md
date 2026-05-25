# event-stream — spec delta

## MODIFIED Requirements

### Requirement: Event Type Enumeration
The system SHALL emit one of five event types during a simulation. Every event SHALL include `type`, `sim_id`, and ISO-8601 `t` (timestamp) fields.

The five types are:
- `sim_started` — emitted exactly once at simulation start
- `round_started` — emitted at the start of each round
- `agent_decision` — emitted once per agent per round
- `round_settled` — emitted once per round after settlement
- `sim_ended` — emitted exactly once at termination

#### Scenario: sim_started fields
- **WHEN** a simulation begins
- **THEN** the first event SHALL have `type: "sim_started"` and SHALL include the full `GameConfig` under a `config` field

#### Scenario: agent_decision fields
- **WHEN** an agent's decision for round N is processed
- **THEN** an `agent_decision` event SHALL include `round`, `agent`, `raw` (LLM raw text), `parsed` (the typed action or null), and optional `tokens: {input, output}` if available

#### Scenario: round_settled fields
- **WHEN** round N's settlement completes
- **THEN** a `round_settled` event SHALL include:
  - `round: N`
  - `prev_energies` — map of all agent IDs to integer energies at round start (before transfers and pressure)
  - `energies` — post-settlement map of all agent IDs to integer energies; eliminated agents at 0
  - `transfers` — array of `{ from, to, amount }` reflecting actual policy-truncated transfers
  - `pressure_cost` — the integer maintenance fee deducted from each living agent
  - `eliminated` — list of agent IDs newly eliminated this round

#### Scenario: sim_ended fields
- **WHEN** the simulation terminates
- **THEN** a `sim_ended` event SHALL include `reason: "max_rounds" | "all_eliminated" | "one_survivor"` and `survivors` (list of agent IDs with energy > 0)
