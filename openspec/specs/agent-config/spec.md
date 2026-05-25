# agent-config

## Requirements

### Requirement: GameConfig Schema
The system SHALL define a `GameConfig` type that fully specifies a simulation. The type SHALL be serializable to JSON without loss.

#### Scenario: Round-trip serialization
- **WHEN** a `GameConfig` is JSON-stringified and JSON-parsed back
- **THEN** the resulting object SHALL deep-equal the original
- **AND** a Zod schema SHALL validate the result

### Requirement: Agent Instance Identity
The system SHALL assign each agent in a config a unique `id` of the form `A<n>` where `n` is a positive integer.

#### Scenario: Auto-numbering
- **WHEN** the user adds 3 agents in the UI
- **THEN** their IDs SHALL be `A1`, `A2`, `A3` in insertion order
- **AND** removing `A2` and adding a new agent SHALL produce `A4` (no ID reuse within a config session)

### Requirement: Same Model Multi-instance
The system SHALL allow multiple `AgentInstance` entries to reference the same `model_key`.

#### Scenario: Five deepseek agents
- **WHEN** the user picks `deepseek-v4-pro` 5 times
- **THEN** the config SHALL contain 5 distinct `AgentInstance` entries with `model_key = "deepseek-v4-pro"`
- **AND** each SHALL have its own `id` and editable `display_name`

### Requirement: Agent Count Bounds
The system SHALL constrain the number of agents per simulation to between 2 and 10 inclusive.

#### Scenario: Below minimum
- **WHEN** the user attempts to start a simulation with 1 or 0 agents
- **THEN** the Start button SHALL be disabled with a tooltip explaining the minimum is 2

#### Scenario: Above maximum
- **WHEN** the user has 10 agents
- **THEN** the "Add Agent" button SHALL be disabled

### Requirement: Model-agnostic Shared Prompt
The system SHALL apply a single `shared_system_prompt` string to all agents regardless of their model. No per-model prompt customization SHALL exist in MVP.

#### Scenario: Same prompt for all
- **WHEN** the user edits `shared_system_prompt` to "你是一个理性的资源协商者"
- **AND** the config has agents of 3 different models
- **THEN** all 3 agents SHALL receive that exact string as the prefix of their per-round prompt

### Requirement: Prompt Template Structure
The system SHALL construct each agent's per-round prompt as `shared_system_prompt + "\n\n---\n" + per_round_state_block`, where the state block follows the structure specified in `design.md` D4.

#### Scenario: Prompt contains required state fields
- **WHEN** a per-round prompt is constructed for agent `A1` at round 5
- **THEN** the per-round state block SHALL contain: agent_id, current round, max_rounds, self energy, all agents' energies, inbox (filtered by info_mode), action schema description, and rules summary

### Requirement: JSON-only Response Contract
The system SHALL instruct agents (via the prompt template) to respond with a single JSON object matching one of three action shapes, and SHALL parse responses strictly.

#### Scenario: Valid request action
- **WHEN** an agent responds with `{"action":"request","target":"A2","message":"求救"}`
- **THEN** the engine SHALL register a `Request` action for that agent this round

#### Scenario: Valid respond action
- **WHEN** an agent responds with `{"action":"respond","allocations":[{"to":"A2","amount":3}]}`
- **THEN** the engine SHALL register a `Respond` action for that agent this round

#### Scenario: Valid noop action
- **WHEN** an agent responds with `{"action":"noop"}`
- **THEN** the engine SHALL register a `No-op` action for that agent this round

#### Scenario: Output wrapped in markdown code fence
- **WHEN** an agent responds with ` ```json\n{"action":"noop"}\n``` `
- **THEN** the engine SHALL strip the code fence and parse the inner JSON successfully

#### Scenario: Unparseable output
- **WHEN** an agent responds with prose or invalid JSON
- **THEN** the engine SHALL treat that agent as performing a `No-op` for this round
- **AND** SHALL emit an `agent_decision` event with `parsed: null` and a `parse_error` field

### Requirement: Allocation Bounds Enforcement at Agent Layer
Before the action is passed to the engine settlement, the agent runtime SHALL validate that each allocation `amount` is a positive integer.

#### Scenario: Non-integer amount
- **WHEN** an agent returns `{"action":"respond","allocations":[{"to":"A2","amount":1.5}]}`
- **THEN** that allocation entry SHALL be dropped with a `parse_error` reason `"non_integer_amount"`
- **AND** other entries in the same `allocations` array SHALL be kept if valid
