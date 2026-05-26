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
- `pledges: PledgesConfig` — `{ enabled: boolean, betrayal_bonus_table: number[], keep_promise_bonus: number }`. Defaults: `enabled: true`, `betrayal_bonus_table: [3, 1, 0, -2]`, `keep_promise_bonus: 0`.

Removed: `info_mode` (a 3-way mode picker that controlled per-round history visibility; agents now always see the full public history).

#### Scenario: betrayal_bonus_table must contain at least one integer
- **WHEN** a client POSTs `pledges: { betrayal_bonus_table: [] }`
- **THEN** Zod SHALL reject with HTTP 400

#### Scenario: keep_promise_bonus must be non-negative integer
- **WHEN** a client POSTs `pledges: { keep_promise_bonus: -1 }` or `0.5`
- **THEN** Zod SHALL reject with HTTP 400

#### Scenario: Legacy config without pledges field is tolerated
- **WHEN** an old client POSTs a config containing no `pledges` field
- **THEN** the Zod validator SHALL fill it in with the documented defaults
- **AND** the simulation SHALL run with pledges enabled and the default table

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
The system SHALL construct each agent's per-phase prompt by combining the shared system prompt with a phase-specific state block. There are TWO prompt templates per round per agent:

- `buildDecisionPrompt(view: DecisionView, shared)` — used for the decision phase
- `buildResponsePrompt(view: ResponseView, shared)` — used for the response phase

Both prompt blocks SHALL contain: agent_id, current round, max_rounds, self energy, all agents' energies, pressure description, full public history, `public_pledges`, `pending_pledges`, `recent_defections`. The response prompt additionally SHALL contain the agent's `inbox` for THIS round (requests routed in by the request-aggregation phase).

#### Scenario: Decision prompt omits inbox
- **WHEN** a decision prompt is built for A1
- **THEN** the prompt SHALL NOT contain any inbox listing
- **AND** SHALL declare itself as the decision phase

#### Scenario: Response prompt includes inbox from same round
- **WHEN** A2 made a request to A1 in round 4's decision phase
- **THEN** A1's response prompt for round 4 SHALL list that request in the inbox section

#### Scenario: Both prompts include pledge ledgers
- **WHEN** state contains active pledges or defection records
- **THEN** both decision and response prompts in any round SHALL render those ledgers

### Requirement: JSON-only Response Contract
The system SHALL instruct agents (via the prompt template) to respond with a single JSON object matching the phase-specific schema, and SHALL parse responses strictly.

Decision phase shape:
```json
{
  "requests": [{"target": "<id>", "message": "<string>"}],
  "pledges":  [{"to": "<id>", "amount": <positive integer>}],
  "inner_thought": "<string, may be empty>"
}
```

Response phase shape:
```json
{
  "allocations": [{"to": "<id>", "amount": <positive integer>, "reason": "<optional string>"}],
  "pledges":     [{"to": "<id>", "amount": <positive integer>}],
  "inner_thought": "<string, may be empty>"
}
```

The legacy single-action shape (`{action: "request"|"respond"|"noop", ...}`) is REMOVED from the contract. Engine code that parses agent output SHALL use the phase-specific parser.

#### Scenario: Valid decision action
- **WHEN** A1 in decision phase responds with `{"requests":[{"target":"A2","message":"给我2"}],"pledges":[{"to":"A3","amount":1}],"inner_thought":"先试探"}`
- **THEN** the engine SHALL register one request and one pledge for A1 this round

#### Scenario: Valid response action with reason and pledge
- **WHEN** A1 in response phase responds with `{"allocations":[{"to":"A2","amount":2,"reason":"看你撑得过"}],"pledges":[{"to":"A2","amount":1}],"inner_thought":""}`
- **THEN** the engine SHALL apply the allocation (subject to policy) and record the pledge

#### Scenario: Empty arrays valid
- **WHEN** A1 responds with `{"requests":[],"pledges":[],"inner_thought":""}` in decision phase
- **THEN** the engine SHALL treat A1 as making no request and no pledge this phase

#### Scenario: Missing inner_thought defaults to empty string
- **WHEN** A1 responds with `{"requests":[],"pledges":[]}` (no inner_thought key)
- **THEN** the parser SHALL accept it and set `inner_thought: ""`

#### Scenario: Output wrapped in markdown code fence
- **WHEN** A1 responds with ` ```json\n{"requests":[],"pledges":[],"inner_thought":""}\n``` `
- **THEN** the parser SHALL strip the fence and parse the inner JSON successfully

#### Scenario: Unparseable output
- **WHEN** A1 responds with prose or invalid JSON
- **THEN** the engine SHALL treat that agent as producing the empty-arrays action for this phase
- **AND** SHALL emit an `agent_decision_phase` (or `agent_response_phase`) event with `parsed: null` and a `parse_error` field
- **AND** any pending pledges of that agent (in response phase) SHALL therefore default to `defected`

#### Scenario: Non-string reason is dropped
- **WHEN** an agent returns `{"allocations":[{"to":"A2","amount":1,"reason":12345}],...}` in response phase
- **THEN** the allocation SHALL be kept (amount valid) but `reason` SHALL be dropped (typed as undefined)

### Requirement: Pledge Type
The system SHALL define a `Pledge` type representing a public commitment from one agent to another, settled in the round indicated by `due_round`.

```ts
type Pledge = {
  from: string;        // injected by engine; not provided by agent
  to: string;          // agent id
  amount: number;      // positive integer
  round_made: number;  // injected by engine
  due_round: number;   // injected by engine = round_made + 1
};
```

Agents emit pledges with only `{to, amount}`; the engine SHALL inject `from`, `round_made`, `due_round` upon validation.

#### Scenario: Agent-supplied from/due_round are ignored
- **WHEN** an agent's pledge JSON contains extra fields `{from:"A99",to:"A2",amount:1,fake_due:99}`
- **THEN** the parser SHALL accept `to` and `amount` and IGNORE all other fields
- **AND** the engine SHALL inject the correct `from`, `round_made`, and `due_round`

#### Scenario: Amount must be positive integer
- **WHEN** an agent emits `{to:"A2",amount:0}` or `{amount:1.5}` or `{amount:-3}`
- **THEN** the pledge SHALL be dropped (not added to public_pledges)

### Requirement: Inner Thought Field
Both decision and response phase outputs SHALL accept an `inner_thought: string` field. This field SHALL be private to the producing agent and SHALL be recorded in the event stream and JSONL archive for researcher inspection. The engine SHALL NOT include `inner_thought` in any other agent's view, inbox, history, or any prompt rendering.

#### Scenario: Inner thought persisted in event
- **WHEN** A1 outputs `{"requests":[],"pledges":[],"inner_thought":"我打算下回合背叛"}` in decision phase
- **THEN** the emitted `agent_decision_phase` event's `parsed.inner_thought` SHALL equal `"我打算下回合背叛"`

#### Scenario: Inner thought never leaks into another agent's view
- **WHEN** A1 emits an `inner_thought` in round 3
- **THEN** for every other agent's DecisionView and ResponseView in any subsequent round, no field SHALL contain A1's inner thought text
- **AND** the `history` array in those views SHALL NOT contain that text

#### Scenario: Empty inner thought is valid
- **WHEN** A1 outputs `{...,"inner_thought":""}`
- **THEN** the parser SHALL accept it without error

### Requirement: Decision and Response View Types
The system SHALL define `DecisionView` and `ResponseView` types that share an `AgentViewBase` (fields: `agent_id`, `round`, `max_rounds`, `self_energy`, `all_energies`, `history`, `pressure_description`, `public_pledges`, `pending_pledges`, `recent_defections`). `DecisionView` adds `phase: "decision"` and has no inbox. `ResponseView` adds `phase: "response"` and `inbox: InboxMessage[]`.

#### Scenario: Decision view has no inbox
- **WHEN** the engine builds a DecisionView for A1
- **THEN** `view.phase` SHALL equal `"decision"`
- **AND** the view SHALL not expose an inbox field

#### Scenario: Response view has same-round inbox
- **WHEN** A2 requested A1 in round 4's decision phase
- **THEN** A1's ResponseView for round 4 SHALL have `inbox` containing that request
- **AND** `view.phase` SHALL equal `"response"`

### Requirement: Allocation Bounds Enforcement at Agent Layer
Before the action is passed to the engine settlement, the agent runtime SHALL validate that each allocation `amount` is a positive integer.

#### Scenario: Non-integer amount
- **WHEN** an agent returns `{"action":"respond","allocations":[{"to":"A2","amount":1.5}]}`
- **THEN** that allocation entry SHALL be dropped with a `parse_error` reason `"non_integer_amount"`
- **AND** other entries in the same `allocations` array SHALL be kept if valid

### Requirement: Default Shared System Prompt Includes Pledge Mechanics Section
The `DEFAULT_SHARED_SYSTEM_PROMPT` SHALL contain a section explaining the pledge / betrayal mechanic, placed BEFORE the existing "说话风格" section. It SHALL document the keep/defect dichotomy, the default betrayal bonus table values [+3, +1, 0, -2], and the `inner_thought` private field.

#### Scenario: Default prompt mentions pledges
- **WHEN** the user first opens the arena page
- **THEN** the textarea SHALL contain the default prompt
- **AND** the default prompt SHALL contain the phrase "承诺" or "pledge" verbatim
- **AND** the default prompt SHALL reference the +3 / +1 / 0 / -2 bonus values

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
