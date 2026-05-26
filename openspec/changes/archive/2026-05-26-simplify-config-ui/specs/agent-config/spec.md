# agent-config — spec delta

## MODIFIED Requirements

### Requirement: GameConfig Schema
The system SHALL define a `GameConfig` type that fully specifies a simulation. The type SHALL be serializable to JSON without loss.

`GameConfig` fields:
- `agents: AgentInstance[]` (length 2–10)
- `shared_system_prompt: string` (non-empty)
- `initial_energy: number` (positive integer)
- `max_rounds: number` (positive integer)
- `info_mode: InformationMode` (discriminated union)
- `pressure: PressureCurve` (discriminated union)
- `allocation_policy: AllocationPolicy` (discriminated union)
- `master_seed: number` (integer; consumed by the engine to seed deterministic RNG)

Removed in this change: `max_requests_per_round` (was never read by the engine and provided no observable behavior; removed entirely from the schema).

#### Scenario: Round-trip serialization
- **WHEN** a `GameConfig` is JSON-stringified and JSON-parsed back
- **THEN** the resulting object SHALL deep-equal the original
- **AND** a Zod schema SHALL validate the result

#### Scenario: Legacy field rejected
- **WHEN** an old client POSTs a config containing `max_requests_per_round`
- **THEN** the Zod validator MAY ignore the extra field (passthrough) or accept the config without error
- **AND** the simulation SHALL run as if the field were absent (it has no effect)
