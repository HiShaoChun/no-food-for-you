# agent-config — spec delta

## MODIFIED Requirements

### Requirement: GameConfig Schema
The system SHALL define a `GameConfig` type that fully specifies a simulation. The type SHALL be serializable to JSON without loss.

`GameConfig` fields:
- `agents: AgentInstance[]` (length 2–10)
- `shared_system_prompt: string` (non-empty)
- `initial_energy: number` (positive integer)
- `max_rounds: number` (positive integer)
- `pressure: PressureCurve` (discriminated union)
- `allocation_policy: AllocationPolicy` (discriminated union)
- `master_seed: number` (integer; consumed by the engine to seed deterministic RNG)

Removed in this change: `info_mode` (was a 3-way mode picker controlling per-round history visibility; agents now always see the full history of public events).

#### Scenario: Round-trip serialization
- **WHEN** a `GameConfig` is JSON-stringified and JSON-parsed back
- **THEN** the resulting object SHALL deep-equal the original
- **AND** a Zod schema SHALL validate the result

#### Scenario: Legacy info_mode field tolerated
- **WHEN** an old client POSTs a config containing the removed `info_mode` field
- **THEN** the Zod validator SHALL strip/ignore the extra field
- **AND** the simulation SHALL run with full history visible to all agents (equivalent to the legacy `open` mode)

### Requirement: Prompt Template Structure
The system SHALL construct each agent's per-round prompt as `shared_system_prompt + "\n\n---\n" + per_round_state_block`, where the state block follows the structure specified in `design.md` D4.

#### Scenario: Prompt contains required state fields
- **WHEN** a per-round prompt is constructed for agent `A1` at round 5
- **THEN** the per-round state block SHALL contain: agent_id, current round, max_rounds, self energy, all agents' energies, inbox, full history of public events since round 1, action schema description, and rules summary
