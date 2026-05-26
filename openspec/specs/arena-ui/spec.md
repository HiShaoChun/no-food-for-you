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
- Pledges panel (collapsible, NEW):
  - `enabled` — checkbox; default checked
  - `betrayal_bonus_table` — 4 integer inputs labeled "1 人 / 2 人 / 3 人 / 4+ 人"; default `[3, 1, 0, -2]`
  - `keep_promise_bonus` — non-negative integer input; default `0`

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
The system SHALL render LLM interactions as a vertically scrolling timeline of chat bubbles, grouped by round. Each round produces TWO bubble groups per living agent: one from the `agent_decision_phase` event and one from the `agent_response_phase` event.

#### Scenario: Decision phase bubble with request and pledge
- **WHEN** an `agent_decision_phase` event arrives with non-empty `parsed.requests` and `parsed.pledges`
- **THEN** a bubble SHALL appear labeled "[决策]"
- **AND** SHALL render each request line ("→ A2: 给2")
- **AND** SHALL render a distinct **pledge chip** (purple ◆ icon) for each pledge

#### Scenario: Response phase bubble with allocations
- **WHEN** an `agent_response_phase` event arrives with non-empty `parsed.allocations`
- **THEN** a bubble SHALL appear labeled "[响应]"
- **AND** SHALL render each allocation as "→ <to>: <amount>" (with reason "· <reason>" inline if present)

#### Scenario: Empty arrays render compact placeholder
- **WHEN** a phase event has empty arrays and empty pledges
- **THEN** the bubble SHALL render a compact gray "[决策/响应] 无动作" line

#### Scenario: Parse error rendered with raw toggle
- **WHEN** a phase event has `parsed === null`
- **THEN** the bubble SHALL show "解析失败" in red
- **AND** a "show raw" expand toggle SHALL reveal the raw LLM text

#### Scenario: Legacy agent_decision events still render
- **WHEN** an older JSONL is replayed and the registry replays `agent_decision` events
- **THEN** the UI SHALL render them using the previous single-action layout (request OR respond OR noop)
- **AND** SHALL NOT crash on unknown event shape

### Requirement: Energy Line Chart
The system SHALL render a line chart showing each agent's energy over rounds. The chart SHALL update incrementally as `round_settled` events arrive.

#### Scenario: One line per agent
- **WHEN** the config has N agents
- **THEN** the chart SHALL show N distinct lines colored by agent
- **AND** the legend SHALL show each agent's display_name

#### Scenario: Eliminated agent line stops
- **WHEN** an agent is eliminated at round T
- **THEN** that agent's line SHALL terminate at (T, 0) and not extend further

### Requirement: Token Meter Split by Phase
The system SHALL display token consumption split by phase: `Decision: input/output` and `Response: input/output`. The total remains visible.

#### Scenario: Decision phase increments decision counter
- **WHEN** an `agent_decision_phase` event arrives with `tokens: {input: 100, output: 50}`
- **THEN** the Decision row SHALL increment by 100/50 AND the Total SHALL increment by 100/50

#### Scenario: Response phase increments response counter
- **WHEN** an `agent_response_phase` event arrives with `tokens: {input: 80, output: 30}`
- **THEN** the Response row SHALL increment by 80/30 AND the Total SHALL increment by 80/30

#### Scenario: Legacy agent_decision event accumulates into Total only
- **WHEN** an older log replays `agent_decision` events with token info
- **THEN** the Total SHALL increment but neither Decision nor Response row SHALL change

### Requirement: SSE Reconnection
The system SHALL automatically reconnect to the SSE endpoint if the connection drops mid-simulation, and SHALL not duplicate events already rendered.

#### Scenario: Network blip mid-game
- **WHEN** the SSE connection drops at round 15 and reconnects at round 16
- **THEN** the client SHALL receive the JSONL backlog from the server (per event-stream spec)
- **AND** SHALL deduplicate events it has already rendered, using `(sim_id, round, type, agent?)` as the dedupe key

### Requirement: Round Settle Card
The system SHALL render a `RoundSettleCard` immediately after each `round_settled` event in the chat timeline, summarizing the round's outcome in one card.

The card SHALL contain (in order):
- Round number badge
- Pressure cost label (e.g., "压力 -1")
- For each agent: a colored swatch, ID/display_name, and `prev → curr (delta)` line
- A `transfers` section listing every `{ from → to: amount }` entry; SHALL be omitted entirely if `transfers.length === 0`
- A `pledges_settled` section listing every settled pledge with status badge and bonus; SHALL be omitted if empty
- A `pledges_made` chip row listing every new pledge this round; SHALL be omitted if empty

#### Scenario: Pledges settled section shows kept and defected
- **WHEN** `round_settled.pledges_settled_this_round` contains both kept and defected entries
- **THEN** the card's "本回合承诺结算" section SHALL render rows with green "守约" and red "背叛" labels and the bonus_paid value

#### Scenario: Pledges made chip row
- **WHEN** `round_settled.pledges_made_this_round` has entries
- **THEN** the card SHALL render a horizontal chip row labeled "本回合新承诺"

#### Scenario: All pledge sections empty
- **WHEN** both `pledges_settled_this_round` and `pledges_made_this_round` are empty
- **THEN** neither pledge section SHALL render

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

### Requirement: Public Pledges Panel
The system SHALL render a `PublicPledgesPanel` in the Arena's side area showing all currently active pledges in real time. The panel SHALL update on every `round_settled` event by re-deriving the active set from `pledges_made_this_round` minus historical `pledges_settled_this_round`.

#### Scenario: New pledge appears immediately
- **WHEN** a `round_settled` event for round 3 contains `pledges_made_this_round: [{from:"A1",to:"A2",amount:2,round_made:3,due_round:4}]`
- **THEN** the panel SHALL display "A1 → A2: 2 (R4 到期)" after that event is processed

#### Scenario: Settled pledge disappears
- **WHEN** a subsequent `round_settled` event for round 4 contains that pledge in `pledges_settled_this_round`
- **THEN** the panel SHALL NOT show that pledge after processing round 4's event

#### Scenario: Empty state
- **WHEN** no active pledges exist
- **THEN** the panel SHALL show "（暂无公开承诺）" muted text

### Requirement: Defection Ledger Panel
The system SHALL render a `DefectionLedger` in the Arena's side area showing every defection that has occurred this simulation, newest first.

#### Scenario: Defection appears immediately
- **WHEN** a `round_settled` event for round 4 contains `pledges_settled_this_round` with `status: "defected"`
- **THEN** the ledger SHALL prepend an entry showing round / from / to / pledged-vs-actual / bonus_paid

#### Scenario: Empty state
- **WHEN** no defections yet
- **THEN** the panel SHALL show "（暂无背叛记录）" muted text

### Requirement: Inner Thought Researcher Toggle
The system SHALL render a "研究者视角" toggle in the Arena header. The toggle SHALL default to OFF. When ON, every chat bubble SHALL render the producing agent's `inner_thought` text as a small, italic, muted-grey card directly below the bubble's main content. When OFF, no `inner_thought` text SHALL be visible anywhere in the UI.

#### Scenario: Toggle off → no inner thought visible
- **WHEN** the toggle is OFF
- **THEN** no DOM element SHALL contain any agent's `inner_thought` text

#### Scenario: Toggle on → inner thought below each bubble
- **WHEN** the toggle is flipped to ON
- **THEN** each bubble whose `parsed.inner_thought` is non-empty SHALL render an additional muted-grey italic card containing that text
- **AND** bubbles with empty inner thought SHALL render nothing extra
