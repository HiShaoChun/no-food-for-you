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
- `pressure` — radio (constant / linear / step) + conditional parameter inputs
- `allocation_policy` — radio (fully_free / capped / proportional) + conditional `cap` input

The system SHALL NOT render UI controls for:
- `master_seed` (auto-randomized on every Start; see "Auto-randomized Master Seed")
- `max_requests_per_round` (field removed from `GameConfig` entirely)
- `info_mode` (field removed from `GameConfig`; agents always see full public history)

#### Scenario: Defaults render without errors
- **WHEN** the page first loads
- **THEN** all listed controls SHALL be populated with the defaults above
- **AND** no `master_seed` input SHALL appear
- **AND** no `max_requests_per_round` input SHALL appear
- **AND** no `info_mode` / "信息模式" control SHALL appear

### Requirement: Auto-randomized Master Seed
The system SHALL replace `config.master_seed` with a fresh random integer immediately before POSTing to `/api/simulate`. The seed SHALL NOT be user-editable through the UI.

#### Scenario: Each Start uses a new seed
- **WHEN** the user clicks Start twice in succession with the same config
- **THEN** the two simulations SHALL run with two different `master_seed` values
- **AND** each run's `sim_started` event SHALL record the seed used (for reproducibility via JSONL)

#### Scenario: Seed is not in the form
- **WHEN** the user inspects the Config Panel
- **THEN** no input control SHALL exist for `master_seed`
- **AND** no 🎲 button SHALL exist

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

#### Scenario: Respond bubble without reasons
- **WHEN** an `agent_decision` event arrives with `parsed.action === "respond"` and no allocations carry a `reason`
- **THEN** a bubble SHALL appear listing each allocation as "→ <to>: <amount>"

#### Scenario: Respond bubble with reasons
- **WHEN** an `agent_decision` event arrives with `parsed.action === "respond"` and at least one allocation has a non-empty `reason`
- **THEN** the bubble SHALL render each allocation with its reason inline (e.g. "→ <to>: <amount> · <reason>")
- **AND** allocations without `reason` SHALL render normally (no trailing separator/blank)

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

### Requirement: Round Settle Card
The system SHALL render a `RoundSettleCard` immediately after each `round_settled` event in the chat timeline, summarizing the round's outcome in one horizontal card.

The card SHALL contain:
- Round number badge
- Pressure cost label (e.g., "压力 -1")
- For each agent: a colored swatch, ID/display_name, and `prev → curr (delta)` line
- A transfers section listing every `{ from → to: amount }` entry from the event; SHALL be omitted entirely if `transfers.length === 0`

#### Scenario: Card renders all agents with delta
- **WHEN** a `round_settled` event arrives with `prev_energies: {A1: 9, A2: 9}` and `energies: {A1: 8, A2: 10}`
- **THEN** the card SHALL render two cells: `A1 9→8 (-1)` and `A2 9→10 (+1)`
- **AND** the `+1` SHALL be styled as positive (green); the `-1` as neutral or negative

#### Scenario: Transfers row omitted when empty
- **WHEN** `transfers === []`
- **THEN** the transfers row SHALL NOT render (no empty heading)

#### Scenario: Transfer chip exposes reason as tooltip
- **WHEN** a `transfers[i]` entry has a non-empty `reason`
- **THEN** the rendered chip SHALL include the reason text in its `title` attribute (HTML tooltip)
- **AND** the visible chip layout SHALL NOT change (to preserve horizontal density)

#### Scenario: Backward compatibility with legacy logs
- **WHEN** a `round_settled` event arrives without `prev_energies` or `transfers` (older log)
- **THEN** the card SHALL still render
- **AND** SHALL omit deltas and the transfers row gracefully

### Requirement: Tombstone Card
The system SHALL replace the inline `⚰ 淘汰: X` text with a centered `TombstoneCard` for each eliminated agent.

The card SHALL contain:
- A 💀 emoji or skull icon
- The eliminated agent's display_name
- The round of elimination and survival count
- A colored swatch matching the agent's chart color

#### Scenario: One card per eliminated agent
- **WHEN** a `round_settled` event has `eliminated: ["A1", "A3"]`
- **THEN** two `TombstoneCard`s SHALL render in order, before the round's `RoundSettleCard`

### Requirement: Final Standings Card
The system SHALL render a full-width `FinalStandings` card after the `sim_ended` event.

The card SHALL contain:
- Header: 🏁 GAME OVER · `reason` · 持续 N 回合 · 总 token X
- A ranked agent table with columns: `#`, `Agent`, `生存`, `给出`, `收到`, `请求次数`, `响应次数`
- Three award badges: `🏅 最慷慨` (most energy given), `💸 最依赖` (most requests sent), `🏆 长寿王` (longest survivor)

#### Scenario: Ranking puts survivors first
- **WHEN** the sim ends with one survivor A2 and three eliminated
- **THEN** A2 SHALL appear at rank #1
- **AND** other rows SHALL be sorted by elimination round descending (later eliminations rank higher)

#### Scenario: Stats computed from event stream
- **WHEN** computing `给出`/`收到`/`请求次数`/`响应次数`
- **THEN** the values SHALL be derived as follows:
  - `给出 = Σ transfer.amount where transfer.from === agent_id` across all `round_settled` events
  - `收到 = Σ transfer.amount where transfer.to === agent_id`
  - `请求次数 = count of agent_decision events where parsed.action === "request" AND agent === agent_id`
  - `响应次数 = count of agent_decision events where parsed.action === "respond" AND agent === agent_id`

#### Scenario: Awards omit when no contender
- **WHEN** no agent ever transferred energy
- **THEN** the `🏅 最慷慨` badge SHALL NOT render (or render with "无")

#### Scenario: Single-survivor scenario
- **WHEN** the sim ends with `reason: "one_survivor"`
- **THEN** the header SHALL include a small "👑 幸存者: <display_name>" line
