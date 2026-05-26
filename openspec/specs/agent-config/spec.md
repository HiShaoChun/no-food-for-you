# agent-config

## Requirements

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

Removed: `info_mode` (a 3-way mode picker that controlled per-round history visibility; agents now always see the full public history).

#### Scenario: Round-trip serialization
- **WHEN** a `GameConfig` is JSON-stringified and JSON-parsed back
- **THEN** the resulting object SHALL deep-equal the original
- **AND** a Zod schema SHALL validate the result

#### Scenario: Legacy field tolerated
- **WHEN** an old client POSTs a config containing the removed `max_requests_per_round` field
- **THEN** the Zod validator MAY pass through (ignore) the extra field
- **AND** the simulation SHALL run as if the field were absent (it has no effect on the engine)

#### Scenario: Legacy info_mode field tolerated
- **WHEN** an old client POSTs a config containing the removed `info_mode` field
- **THEN** the Zod validator SHALL strip/ignore the extra field
- **AND** the simulation SHALL run with full history visible to all agents (equivalent to the legacy `open` mode)

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
- **THEN** the per-round state block SHALL contain: agent_id, current round, max_rounds, self energy, all agents' energies, inbox, full history of public events since round 1, action schema description, and rules summary

### Requirement: JSON-only Response Contract
The system SHALL instruct agents (via the prompt template) to respond with a single JSON object matching one of three action shapes, and SHALL parse responses strictly.

Action shapes:
- `request`: `{ "action": "request", "target": "<id>", "message": "<string>" }`
- `respond`: `{ "action": "respond", "allocations": [ { "to": "<id>", "amount": <positive integer>, "reason": "<optional string>" } ] }`
- `noop`: `{ "action": "noop" }`

#### Scenario: Valid request action
- **WHEN** an agent responds with `{"action":"request","target":"A2","message":"给我 2 点呗"}`
- **THEN** the engine SHALL register a `Request` action for that agent this round

#### Scenario: Valid respond action without reason
- **WHEN** an agent responds with `{"action":"respond","allocations":[{"to":"A2","amount":3}]}`
- **THEN** the engine SHALL register a `Respond` action with that allocation; `reason` SHALL be undefined

#### Scenario: Valid respond action with reason
- **WHEN** an agent responds with `{"action":"respond","allocations":[{"to":"A2","amount":3,"reason":"看你还能撑两轮"}]}`
- **THEN** the engine SHALL register a `Respond` action with the reason preserved on that allocation

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

#### Scenario: Non-string reason is dropped
- **WHEN** an agent returns `{"action":"respond","allocations":[{"to":"A2","amount":1,"reason":12345}]}`
- **THEN** the allocation SHALL be kept (amount valid) but `reason` SHALL be dropped (typed as undefined)

### Requirement: Allocation Bounds Enforcement at Agent Layer
Before the action is passed to the engine settlement, the agent runtime SHALL validate that each allocation `amount` is a positive integer.

#### Scenario: Non-integer amount
- **WHEN** an agent returns `{"action":"respond","allocations":[{"to":"A2","amount":1.5}]}`
- **THEN** that allocation entry SHALL be dropped with a `parse_error` reason `"non_integer_amount"`
- **AND** other entries in the same `allocations` array SHALL be kept if valid

### Requirement: Default Shared System Prompt Includes Voice Guidance
The `DEFAULT_SHARED_SYSTEM_PROMPT` SHALL contain a "说话风格" (speaking style) section that:
- Casts the agent as a real human typing in a chat box (not an AI writing business email)
- Applies to both `message` (in request) and `reason` (in respond.allocations)
- Provides 4 high-level rules (length guideline, no broadcasting, no pleasantries, allow informal/emotional tone)
- Provides at least 6 positive voice samples demonstrating range (begging / comparing / reminding / accusing / refusing / etc.)
- Ends with a self-check instruction (read the message back; rewrite if it sounds like ChatGPT email)

The guidance SHALL be plain Markdown text in the prompt, editable by the user via the UI textarea.

#### Scenario: Default prompt loaded into UI
- **WHEN** the user first opens the arena page
- **THEN** the `<textarea>` SHALL contain a non-empty default prompt
- **AND** the default prompt SHALL contain the phrase "说话风格" verbatim
- **AND** the default prompt SHALL contain at least 6 distinct voice sample lines

#### Scenario: User edits or removes voice section
- **WHEN** the user deletes the voice section from the textarea and clicks Start
- **THEN** the simulation SHALL still run (no automatic re-injection of voice rules)
- **AND** agents MAY revert to whatever default style their model has

### Requirement: Length Guidance is Soft
The voice guidance SHALL describe length as a soft preference ("通常 ≤30 字") not a hard limit. The engine SHALL NOT truncate or reject messages based on length.

#### Scenario: Long message accepted
- **WHEN** an agent returns a `message` of 80 characters
- **THEN** the engine SHALL accept it and persist it as-is
- **AND** the UI SHALL display the full message (wrapping as needed)
