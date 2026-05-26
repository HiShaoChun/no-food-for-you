# agent-config — spec delta

## MODIFIED Requirements

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

## ADDED Requirements

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
