# agent-config — spec delta

## MODIFIED Requirements

### Requirement: GameConfig Schema
The system SHALL define a `GameConfig` type that fully specifies a simulation. The type SHALL be serializable to JSON without loss.

`GameConfig` fields:
- `agents: AgentInstance[]` (length 2–10)
- `shared_system_prompt: string` (non-empty)
- `initial_energy: number` (positive integer)
- `max_rounds: number` (positive integer)
- `info_mode: InformationMode` (discriminated union; see [[remove-info-mode]] — if that change merges first, this line is removed)
- `pressure: PressureCurve` (discriminated union)
- `allocation_policy: AllocationPolicy` (discriminated union)
- `master_seed: number` (integer; consumed by the engine to seed deterministic RNG)
- `pledges: PledgesConfig` — `{ enabled: boolean, betrayal_bonus_table: number[], keep_promise_bonus: number }`

`PledgesConfig` defaults:
- `enabled: true`
- `betrayal_bonus_table: [3, 1, 0, -2]` (per Python reference, calibrated for 4-agent games; values for N≥4 reuse the last entry)
- `keep_promise_bonus: 0` (positive-sum reward disabled by default; set >0 to enable)

#### Scenario: Round-trip serialization includes pledges
- **WHEN** a `GameConfig` is JSON-stringified and JSON-parsed back
- **THEN** the resulting object SHALL deep-equal the original
- **AND** a Zod schema SHALL validate the result
- **AND** the `pledges` object SHALL be present with all three sub-fields

#### Scenario: Legacy config without pledges field is tolerated
- **WHEN** an old client POSTs a config containing no `pledges` field (older saved JSONL header replay)
- **THEN** the Zod validator SHALL fill it in with the documented defaults
- **AND** the simulation SHALL run with pledges enabled and default table

#### Scenario: betrayal_bonus_table must contain at least one integer
- **WHEN** a client POSTs `pledges: { betrayal_bonus_table: [] }`
- **THEN** Zod SHALL reject with HTTP 400

#### Scenario: keep_promise_bonus must be non-negative integer
- **WHEN** a client POSTs `pledges: { keep_promise_bonus: -1 }` or `0.5`
- **THEN** Zod SHALL reject with HTTP 400

### Requirement: Prompt Template Structure
The system SHALL construct each agent's per-phase prompt by combining the shared system prompt with a phase-specific state block. There are now TWO prompt templates per round per agent:

- `buildDecisionPrompt(view: DecisionView, shared)` — used for the decision phase
- `buildResponsePrompt(view: ResponseView, shared)` — used for the response phase

Both prompt blocks SHALL contain: agent_id, current round, max_rounds, self energy, all agents' energies, pressure description, full public history, `public_pledges`, `pending_pledges`, `recent_defections`.

The response prompt additionally SHALL contain the agent's `inbox` for THIS round (requests routed in by step 3 of the round phases).

#### Scenario: Decision prompt omits inbox
- **WHEN** a decision prompt is built for A1
- **THEN** the prompt SHALL NOT mention "收件箱" or contain any inbox listing
- **AND** SHALL declare itself as the decision phase

#### Scenario: Response prompt includes inbox from same round
- **WHEN** A2 made a request to A1 in round 4's decision phase
- **THEN** A1's response prompt for round 4 SHALL list that request in the inbox section

#### Scenario: Both prompts include pledge ledgers
- **WHEN** state contains `public_pledges = [{from:"A2",to:"A1",amount:1,due_round:5}]` and `recent_defections = [...]`
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
- **THEN** the engine SHALL treat A1 as making no request and no pledge this phase (equivalent to old "noop")

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

#### Scenario: Legacy action shape parse failure
- **WHEN** an old client mock returns `{"action":"noop"}`
- **THEN** the phase parser SHALL reject (missing `requests`/`allocations` field) and emit `parse_error`
- **AND** the engine SHALL treat the agent as having empty arrays

## ADDED Requirements

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

#### Scenario: Agent-supplied from is ignored
- **WHEN** an agent's pledge JSON contains extra fields `{from:"A99",to:"A2",amount:1,fake_due:99}`
- **THEN** the parser SHALL accept `to` and `amount` and IGNORE all other fields
- **AND** the engine SHALL inject the correct `from` (the calling agent's id), `round_made`, and `due_round`

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
- **THEN** for every other agent's DecisionView and ResponseView in rounds 3, 4, 5, ..., no field SHALL contain A1's inner thought text
- **AND** the `history` array in those views SHALL NOT contain that text

#### Scenario: Empty inner thought is valid
- **WHEN** A1 outputs `{...,"inner_thought":""}`
- **THEN** the parser SHALL accept it without error

### Requirement: Decision and Response View Types
The system SHALL define `DecisionView` and `ResponseView` types that share a `AgentViewBase` (fields: `agent_id`, `round`, `max_rounds`, `self_energy`, `all_energies`, `history`, `pressure_description`, `public_pledges`, `pending_pledges`, `recent_defections`). `DecisionView` adds `phase: "decision"` and forces `inbox: never[]`. `ResponseView` adds `phase: "response"` and `inbox: InboxMessage[]`.

#### Scenario: Decision view has no inbox
- **WHEN** the engine builds a DecisionView for A1
- **THEN** `view.inbox` SHALL be an empty array
- **AND** `view.phase` SHALL equal `"decision"`

#### Scenario: Response view has same-round inbox
- **WHEN** A2 requested A1 in round 4's decision phase
- **THEN** A1's ResponseView for round 4 SHALL have `inbox` containing that request
- **AND** `view.phase` SHALL equal `"response"`

### Requirement: Default Shared System Prompt Includes Pledge Mechanics Section
The `DEFAULT_SHARED_SYSTEM_PROMPT` SHALL contain a section explaining the pledge / betrayal mechanic — placed BEFORE the existing "说话风格" (speaking style) section. The pledge mechanics section SHALL:

- Define `pledge` as "公开承诺，下回合到期"
- Document the keep/defect dichotomy and the default betrayal bonus table values [+3, +1, 0, -2]
- Mention `inner_thought` as private (logged but not shared)
- Be ≤500 Chinese characters to avoid bloating prompts

The guidance SHALL remain plain Markdown editable by the user via the UI textarea.

#### Scenario: Default prompt loaded into UI mentions pledges
- **WHEN** the user first opens the arena page
- **THEN** the textarea SHALL contain the default prompt
- **AND** the default prompt SHALL contain the phrase "承诺" or "pledge" verbatim
- **AND** the default prompt SHALL contain the betrayal bonus table (e.g., the literal text "+3" or similar)
