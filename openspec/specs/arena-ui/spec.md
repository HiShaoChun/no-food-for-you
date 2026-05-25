# arena-ui

## Requirements

### Requirement: Single-page Layout
The system SHALL render the entire MVP experience on a single page (`/`) divided into two regions: a left **Config Panel** and a right **Arena**.

#### Scenario: Initial load
- **WHEN** the user opens `http://localhost:3000`
- **THEN** the page SHALL display the Config Panel populated with sensible defaults
- **AND** the Arena SHALL display an empty state with text "未开始 - 配置完成后点击 Start"

### Requirement: Provider Status Banner
The system SHALL render a status banner at the top of the page indicating which providers have keys configured in `.env`.

#### Scenario: All providers configured
- **WHEN** all 5 `*_API_KEY` env vars are set
- **THEN** the banner SHALL show 5 green pills, one per provider name

#### Scenario: Only ark configured
- **WHEN** only `ARK_API_KEY` is set
- **THEN** the banner SHALL show ark as green and the other 4 as gray
- **AND** the gray pills SHALL show a tooltip "请在 .env 配置 <ENV_KEY_NAME>"

### Requirement: Model Picker with Disabled States
The system SHALL render a model picker that disables (grays out) any model whose provider has no key configured. Selecting a disabled model SHALL be impossible.

#### Scenario: Disabled model invisible to selection
- **WHEN** `availability.ark === false`
- **THEN** all 5 MVP models SHALL appear in the dropdown
- **AND** SHALL be styled as disabled (gray, non-clickable)
- **AND** SHALL show a tooltip explaining how to enable them

### Requirement: Agent Roster Editor
The system SHALL allow the user to add, remove, reorder, and rename agent instances in the config.

#### Scenario: Add agent
- **WHEN** the user clicks "+ Add Agent" (with current count < 10)
- **THEN** a new row SHALL appear with a model dropdown defaulted to the first enabled model
- **AND** an auto-generated `display_name` like "doubao-seed-code #2"

#### Scenario: Remove agent
- **WHEN** the user clicks the trash icon on an agent row (with current count > 2)
- **THEN** that row SHALL be removed
- **AND** other rows SHALL retain their IDs and display names

#### Scenario: Rename agent
- **WHEN** the user edits the display_name input
- **THEN** the new name SHALL be reflected in the Arena's chat bubbles and energy chart legend

### Requirement: Game Parameter Form
The system SHALL render form controls for every field in `GameConfig` except the agent list and shared_system_prompt (which have dedicated UI).

Controls:
- `initial_energy` — number input (default 10, min 1, max 100)
- `max_rounds` — number input (default 30, min 1, max 200)
- `max_requests_per_round` — number input (default 1, min 1, max 5)
- `info_mode` — radio (open / blind / partial) + conditional number input for `k`
- `pressure` — radio (constant / linear / step) + conditional parameter inputs
- `allocation_policy` — radio (fully_free / capped / proportional) + conditional `cap` input
- `master_seed` — number input with a "🎲 random" button

#### Scenario: Defaults render without errors
- **WHEN** the page first loads
- **THEN** all controls SHALL be populated with the defaults listed above

### Requirement: Shared System Prompt Editor
The system SHALL render a `<textarea>` for editing the `shared_system_prompt`. The textarea SHALL pre-fill with a sensible default prompt.

#### Scenario: Default prompt
- **WHEN** the page first loads
- **THEN** the textarea SHALL contain a default Chinese prompt describing the game rules and the agent's role

#### Scenario: Empty prompt
- **WHEN** the user clears the textarea entirely
- **THEN** the Start button SHALL be disabled with tooltip "shared_system_prompt 不能为空"

### Requirement: Start Button
The system SHALL render a Start button that POSTs the current config to `/api/simulate` and then opens an SSE connection to `/api/events/<sim_id>`.

#### Scenario: Click Start with valid config
- **WHEN** the user clicks Start with a valid config
- **THEN** the Start button SHALL transition to a disabled "Running..." state
- **AND** the Arena SHALL begin displaying events

#### Scenario: Start disabled when invalid
- **WHEN** the config has < 2 agents OR an empty shared_system_prompt OR any selected model's provider is unavailable
- **THEN** the Start button SHALL be disabled with a tooltip explaining which check failed

### Requirement: Chat Bubble Timeline
The system SHALL render LLM interactions as a vertically scrolling timeline of chat bubbles, grouped by round.

#### Scenario: Request bubble
- **WHEN** an `agent_decision` event arrives with `parsed.action === "request"`
- **THEN** a bubble SHALL appear showing the source agent's display_name, the target agent's display_name, and the message text
- **AND** the bubble SHALL be styled distinctly from response bubbles

#### Scenario: Respond bubble
- **WHEN** an `agent_decision` event arrives with `parsed.action === "respond"`
- **THEN** a bubble SHALL appear listing each allocation as "→ <to>: <amount>"

#### Scenario: Noop or parse_error
- **WHEN** an `agent_decision` event arrives with `parsed === null` or `parsed.action === "noop"`
- **THEN** a compact gray bubble SHALL show the agent name and "无动作" (or "解析失败" if parse_error)
- **AND** the raw LLM text SHALL be available behind a "show raw" expand toggle

### Requirement: Energy Line Chart
The system SHALL render a line chart showing each agent's energy over rounds. The chart SHALL update incrementally as `round_settled` events arrive.

#### Scenario: One line per agent
- **WHEN** the config has N agents
- **THEN** the chart SHALL show N distinct lines colored by agent
- **AND** the legend SHALL show each agent's display_name

#### Scenario: Eliminated agent line stops
- **WHEN** an agent is eliminated at round T
- **THEN** that agent's line SHALL terminate at (T, 0) and not extend further

### Requirement: Token Meter
The system SHALL display a running total of input/output tokens consumed across all agent calls in the current simulation.

#### Scenario: Token counter updates per decision
- **WHEN** an `agent_decision` event arrives with `tokens: {input, output}`
- **THEN** the meter SHALL increment its totals by those amounts

### Requirement: SSE Reconnection
The system SHALL automatically reconnect to the SSE endpoint if the connection drops mid-simulation, and SHALL not duplicate events already rendered.

#### Scenario: Network blip mid-game
- **WHEN** the SSE connection drops at round 15 and reconnects at round 16
- **THEN** the client SHALL receive the JSONL backlog from the server (per event-stream spec)
- **AND** SHALL deduplicate events it has already rendered, using `(sim_id, round, type, agent?)` as the dedupe key
