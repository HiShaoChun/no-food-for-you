# arena-ui — spec delta

## ADDED Requirements

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
