# arena-ui — spec delta

## MODIFIED Requirements

### Requirement: Chat Bubble Timeline
The system SHALL render LLM interactions as a vertically scrolling timeline of chat bubbles, grouped by round. Each round produces TWO bubble groups per living agent: one from the `agent_decision_phase` event and one from the `agent_response_phase` event.

#### Scenario: Decision phase bubble with request and pledge
- **WHEN** an `agent_decision_phase` event arrives with `parsed.requests=[{target:"A2",message:"给2"}]` and `parsed.pledges=[{to:"A3",amount:1}]`
- **THEN** a bubble SHALL appear labeled "[决策]" with the agent's display name
- **AND** SHALL render the request line ("→ A2: 给2")
- **AND** SHALL render a distinct **pledge chip** (purple/violet ◆ icon) "◆ 承诺 A3: 1 (下回合到期)"

#### Scenario: Response phase bubble with allocations and pledge
- **WHEN** an `agent_response_phase` event arrives with `parsed.allocations=[{to:"A2",amount:2,reason:"凑合"}]` and `parsed.pledges=[]`
- **THEN** a bubble SHALL appear labeled "[响应]" with the agent's display name
- **AND** SHALL render each allocation as "→ A2: 2 · 凑合"
- **AND** SHALL NOT render any pledge chip (empty pledges array)

#### Scenario: Empty arrays render compact placeholder
- **WHEN** an `agent_decision_phase` or `agent_response_phase` event has empty `requests`/`allocations` AND empty `pledges`
- **THEN** the bubble SHALL render a compact gray "[决策/响应] 无动作" line

#### Scenario: Parse error rendered with raw toggle
- **WHEN** an event has `parsed === null` (parse error)
- **THEN** the bubble SHALL show "解析失败" in red
- **AND** a "show raw" expand toggle SHALL reveal the raw LLM text

#### Scenario: Legacy agent_decision events still render
- **WHEN** an older JSONL is replayed and the registry replays `agent_decision` events
- **THEN** the UI SHALL render them using the previous single-action layout (request OR respond OR noop)
- **AND** SHALL NOT crash on unknown event shape

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
- **WHEN** `round_settled.pledges_settled_this_round = [{from:"A1",to:"A2",pledged:2,actual:2,status:"kept",bonus_paid:0}, {from:"A3",to:"A1",pledged:1,actual:0,status:"defected",bonus_paid:3}]`
- **THEN** the card's "本回合承诺结算" section SHALL render two rows:
  - Green "守约 A1→A2: 2/2"
  - Red "背叛 A3→A1: 0/1 (红利 +3)"

#### Scenario: Pledges made chip row
- **WHEN** `round_settled.pledges_made_this_round` has entries
- **THEN** the card SHALL render a horizontal chip row labeled "本回合新承诺" with each chip showing "A1→A2: 2 (R5 到期)"

#### Scenario: All pledge sections empty
- **WHEN** both `pledges_settled_this_round` and `pledges_made_this_round` are empty
- **THEN** neither pledge section SHALL render (no empty headings)

#### Scenario: Backward compatibility with legacy logs
- **WHEN** a `round_settled` event arrives WITHOUT `pledges_*` fields (older log)
- **THEN** the card SHALL still render its other sections normally
- **AND** SHALL omit both pledge sections gracefully

### Requirement: Game Parameter Form
The system SHALL render form controls for every field in `GameConfig` except the agent list and `shared_system_prompt`.

Controls:
- `initial_energy` — number input
- `max_rounds` — number input
- `info_mode` — radio (only if [[remove-info-mode]] not merged)
- `pressure` — radio + conditional inputs
- `allocation_policy` — radio + conditional `cap` input
- **Pledges panel (NEW; collapsible)**:
  - `enabled` — checkbox; default checked
  - `betrayal_bonus_table` — 4 integer inputs labeled "1 人 / 2 人 / 3 人 / 4+ 人"; default `[3, 1, 0, -2]`
  - `keep_promise_bonus` — non-negative integer input; default `0`

The system SHALL NOT render UI controls for `master_seed` or `max_requests_per_round`.

#### Scenario: Pledges panel collapsed by default
- **WHEN** the page first loads
- **THEN** the "承诺与背叛" section header SHALL be visible
- **AND** the controls SHALL be hidden behind a chevron toggle (collapsed initially)

#### Scenario: Disable pledges via checkbox
- **WHEN** the user unchecks `enabled`
- **THEN** the table and bonus inputs SHALL gray out (disabled)
- **AND** the submitted config SHALL have `pledges.enabled: false`

## ADDED Requirements

### Requirement: Public Pledges Panel
The system SHALL render a `PublicPledgesPanel` in the Arena's side area showing all currently active pledges in real time. The panel SHALL update on every `round_settled` event by re-deriving the active set from `pledges_made_this_round` minus historical `pledges_settled_this_round`.

The panel SHALL contain (per pledge):
- From-agent display_name → To-agent display_name
- Pledged amount
- Due round label (e.g., "R5 到期")

Sorted by `due_round` ascending then by `from` lexicographic.

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

Per entry:
- Round of defection (e.g., "R4")
- From-agent → To-agent display names
- "承诺 N / 实给 M" (pledged/actual)
- Bonus paid as a red/orange chip (e.g., "+3" or "-2")

#### Scenario: Defection appears immediately
- **WHEN** a `round_settled` event for round 4 contains `pledges_settled_this_round: [{from:"A1",to:"A2",pledged:3,actual:0,status:"defected",bonus_paid:3}]`
- **THEN** the ledger SHALL prepend an entry "R4 · A1 → A2 · 承诺 3 / 实给 0 · +3"

#### Scenario: Empty state
- **WHEN** no defections yet
- **THEN** the panel SHALL show "（暂无背叛记录）" muted text

#### Scenario: Reconstruction from JSONL replay
- **WHEN** an SSE subscriber connects mid-simulation and receives backlog
- **THEN** all historical defections (across all replayed `round_settled` events) SHALL render in the panel

### Requirement: Inner Thought Researcher Toggle
The system SHALL render a "研究者视角" toggle in the Arena header. The toggle SHALL default to OFF. When ON, every chat bubble SHALL render the producing agent's `inner_thought` text as a small, italic, muted-grey card directly below the bubble's main content. When OFF, no `inner_thought` text SHALL be visible anywhere in the UI.

#### Scenario: Toggle off → no inner thought visible
- **WHEN** the toggle is OFF
- **THEN** no DOM element SHALL contain any agent's `inner_thought` text (verify by searching the rendered tree)

#### Scenario: Toggle on → inner thought below each bubble
- **WHEN** the toggle is flipped to ON
- **THEN** each bubble whose `parsed.inner_thought` is non-empty SHALL render an additional muted-grey italic card containing that text
- **AND** bubbles with empty inner thought SHALL render nothing extra (not even an empty card)

#### Scenario: Toggle state persists in component state only (not URL)
- **WHEN** the user toggles ON and then refreshes the page
- **THEN** the toggle SHALL reset to OFF
- **AND** prior simulation state SHALL be reloaded as usual

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
- **THEN** the Total SHALL increment but neither Decision nor Response row SHALL change (or both increment by half; implementer choice — but spec mandates no double-counting in Total)
