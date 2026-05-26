# arena-ui — spec delta

## MODIFIED Requirements

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
