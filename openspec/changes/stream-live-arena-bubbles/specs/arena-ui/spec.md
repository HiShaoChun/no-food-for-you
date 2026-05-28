# arena-ui — delta

## MODIFIED Requirements

### Requirement: Chat Bubble Timeline
The system SHALL render LLM interactions as a vertically scrolling timeline of chat bubbles, grouped by round. Each round produces TWO bubble groups per living agent: one from the `agent_decision_phase` event and one from the `agent_response_phase` event.

Bubbles SHALL be appended to the timeline in the order events arrive over SSE — NOT in fixed agent (config) order. The engine guarantees per-agent phase events are emitted as soon as each agent's LLM call resolves, so faster agents' bubbles appear first; slower agents' bubbles appear later. Within the timeline:

- Receipt of an `agent_decision_started` (or `agent_response_started`) event SHALL immediately render a **thinking placeholder bubble** for that agent (see Requirement: Thinking Placeholder Bubble).
- Receipt of the corresponding `agent_decision_phase` (or `agent_response_phase`) event SHALL replace that placeholder in place (same React key, `${round}:${agent}:${phase}`) with the full bubble; the timeline SHALL NOT add a new bubble below.
- If `_phase` arrives before its sibling `_started` (a corner case during SSE reconnection / backlog replay), the UI SHALL render the full bubble directly and SHALL NOT also render the placeholder.

#### Scenario: Decision phase bubble with request and pledge
- **WHEN** an `agent_decision_phase` event arrives with non-empty `parsed.requests` and `parsed.pledges`
- **THEN** a bubble SHALL appear labeled "[决策]"
- **AND** SHALL render each request line ("→ A2: 给2") with the target rendered as an `AgentMention` chip
- **AND** SHALL render a distinct **pledge chip** (purple ◆ icon) for each pledge, with `to` rendered as an `AgentMention` chip

#### Scenario: Response phase bubble with allocations
- **WHEN** an `agent_response_phase` event arrives with non-empty `parsed.allocations`
- **THEN** a bubble SHALL appear labeled "[响应]"
- **AND** SHALL render each allocation as "→ <AgentMention> <amount>" (with reason "· <reason>" inline if present)

#### Scenario: Empty arrays render compact placeholder
- **WHEN** a phase event has empty arrays and empty pledges
- **THEN** the bubble SHALL render a compact gray "[决策/响应] 无动作" line

#### Scenario: Parse error rendered with raw toggle
- **WHEN** a phase event has `parsed === null`
- **THEN** the bubble SHALL show "解析失败" in red
- **AND** a "show raw" expand toggle SHALL reveal the raw LLM text (or the captured `parse_error` if `raw` is empty)

#### Scenario: Bubbles ordered by arrival
- **WHEN** in round N agent A2's `agent_decision_phase` event arrives before A1's
- **THEN** A2's bubble SHALL appear above A1's in the timeline
- **AND** the order SHALL NOT be re-sorted when A1's bubble later arrives

#### Scenario: Placeholder replaced in place by full bubble
- **WHEN** an `agent_decision_started` event for `(round: N, agent: "A1")` has rendered a placeholder
- **AND** the corresponding `agent_decision_phase` event for the same key arrives
- **THEN** the timeline SHALL show ONE bubble at that position with the full decision content (NOT two bubbles, NOT a duplicate)

#### Scenario: Phase event arriving before started event (backlog replay)
- **WHEN** during SSE reconnection the backlog delivers an `agent_decision_phase` event before the corresponding `agent_decision_started` for the same `(round, agent)`
- **THEN** the timeline SHALL render the full bubble directly
- **AND** the late `agent_decision_started` SHALL NOT cause a placeholder to appear

### Requirement: Token Meter Split by Phase
The system SHALL display token consumption split by phase: `Decision: input/output` and `Response: input/output`. The total remains visible.

#### Scenario: Decision phase increments decision counter
- **WHEN** an `agent_decision_phase` event arrives with `tokens: {input: 100, output: 50}`
- **THEN** the Decision row SHALL increment by 100/50 AND the Total SHALL increment by 100/50

#### Scenario: Response phase increments response counter
- **WHEN** an `agent_response_phase` event arrives with `tokens: {input: 80, output: 30}`
- **THEN** the Response row SHALL increment by 80/30 AND the Total SHALL increment by 80/30

#### Scenario: Started events do not contribute to token meter
- **WHEN** an `agent_decision_started` or `agent_response_started` event arrives
- **THEN** neither the Decision row nor the Response row nor the Total SHALL change (started events carry no `tokens` field)

## ADDED Requirements

### Requirement: Thinking Placeholder Bubble
The system SHALL render a "thinking" placeholder bubble for each `agent_decision_started` / `agent_response_started` event. The placeholder SHALL be visually distinguishable from completed bubbles and SHALL convey that the agent is currently producing a response.

The placeholder SHALL contain:
- The producing agent's color avatar (same color as that agent's chart line and roster row)
- The agent's `display_name`
- A phase chip ("决策" or "响应") matching the corresponding phase
- A "thinking" animation (three dots fading in and out, or equivalent) with the label "正在思考…"

The placeholder SHALL be addressable by the same React key as the future full bubble (`${round}:${agent}:${phase}`) so that the corresponding `_phase` event replaces it in place without timeline reflow.

#### Scenario: Placeholder appears immediately on started event
- **WHEN** an `agent_decision_started` event for `(round: 3, agent: "A1", phase: "decision")` arrives
- **THEN** a thinking placeholder SHALL be appended to the timeline within the same animation frame
- **AND** the placeholder SHALL show A1's avatar, display_name, "决策" chip, and an animated "正在思考…" label

#### Scenario: Placeholder replaced when phase event arrives
- **WHEN** an `agent_decision_phase` event arrives for the same `(round, agent)` as a rendered placeholder
- **THEN** the placeholder SHALL be replaced by the full bubble at the same DOM position
- **AND** subsequent bubbles below SHALL NOT shift (the replacement SHOULD reuse the same React key)

#### Scenario: 60s soft timeout
- **WHEN** a placeholder has been visible for 60 seconds AND no matching `_phase` event has arrived
- **THEN** the placeholder SHALL transition to a "timeout" visual state (warning color, label changes to "响应超时·等待中")
- **AND** the placeholder SHALL NOT be removed from the timeline (it still represents in-flight work)
- **AND** if the matching `_phase` event later arrives, the placeholder SHALL still be replaced normally

#### Scenario: No placeholder for already-completed phase
- **WHEN** the timeline already contains the `agent_decision_phase` event for `(round, agent)`
- **AND** a late `agent_decision_started` event for the same key arrives (e.g. via backlog replay reordering)
- **THEN** no placeholder SHALL be rendered (the full bubble already occupies that position)

### Requirement: Agent Mention Chip
Every reference to another agent inside a chat bubble's body (request target, allocation `to`, pledge `to`) SHALL be rendered as an `AgentMention` chip rather than as plain text. The chip SHALL visually use that agent's identity color (the same color used on EnergyChart and in the roster) and SHALL render the agent's `display_name`. Hovering an `AgentMention` chip SHALL emit a hover signal that other Arena components SHALL react to.

When an `AgentMention` chip is hovered:
- The corresponding line in the EnergyChart SHALL be visually emphasized (thicker stroke; other lines optionally dimmed).
- The corresponding row in the agent roster (config panel) SHALL be visually emphasized (e.g. `--surface-hover` background).
- The emphasis SHALL clear when the hover ends (mouse leaves OR keyboard focus moves away).

#### Scenario: Mention chip renders with agent color
- **WHEN** a decision bubble's request entry targets `"A2"`
- **AND** A2's identity color is `--A2`
- **THEN** the rendered chip SHALL contain a colored indicator (dot or background tint) computed from `--A2`
- **AND** SHALL contain A2's `display_name` (not the raw id `"A2"`)

#### Scenario: Hover highlights chart line
- **WHEN** the user hovers an `AgentMention` chip referencing A2
- **THEN** A2's line in the EnergyChart SHALL render with increased visual weight (e.g. `strokeWidth: 4`)
- **AND** other agents' chart lines MAY be dimmed (e.g. `strokeOpacity: 0.6`) at the implementation's discretion, but A2's SHALL stand out

#### Scenario: Hover highlights roster row
- **WHEN** the user hovers an `AgentMention` chip referencing A2
- **THEN** the roster row whose `data-agent-id="A2"` SHALL receive a hover style (background `--surface-hover` or equivalent)

#### Scenario: Hover ends, highlights clear
- **WHEN** the user moves the cursor off the `AgentMention` chip
- **THEN** the chart line and roster row SHALL return to their default styles within the same interaction frame

### Requirement: Sticky Scroll With New-Message Indicator
The chat bubble timeline container SHALL maintain a "pinned-to-bottom" mode. When pinned, new events SHALL trigger an automatic scroll to the bottom. When the user scrolls upward and the scroll position is more than 64 pixels above the bottom, the timeline SHALL exit pinned mode and SHALL stop auto-scrolling. While unpinned, the timeline SHALL display a floating "new messages" indicator at the bottom-right of the container, showing the count of events received since unpinning. Clicking the indicator SHALL scroll the timeline to the bottom, reset the count to zero, and re-enter pinned mode.

#### Scenario: Default pinned, auto-scrolls
- **WHEN** the page loads AND the user has not yet scrolled
- **THEN** the timeline SHALL be pinned
- **AND** each new event arrival SHALL scroll the timeline to the bottom

#### Scenario: User scrolls up — pinned mode exits
- **WHEN** the user scrolls upward such that the bottom of the container is more than 64 pixels below the visible viewport
- **THEN** the timeline SHALL transition to unpinned mode
- **AND** subsequent event arrivals SHALL NOT auto-scroll the container

#### Scenario: New-message indicator shows count while unpinned
- **WHEN** the timeline is unpinned AND 3 new events arrive
- **THEN** a floating indicator SHALL appear at the bottom-right of the timeline showing "3 条新消息 ↓" (or equivalent)
- **AND** the indicator SHALL count both `_started` and `_phase` events as separate increments

#### Scenario: Click indicator returns to pinned
- **WHEN** the user clicks the new-message indicator
- **THEN** the timeline SHALL scroll smoothly to the bottom
- **AND** the indicator SHALL hide
- **AND** the count SHALL reset to zero
- **AND** the timeline SHALL be pinned again

#### Scenario: Scrolling back to bottom manually re-pins
- **WHEN** the user manually scrolls the timeline back so the bottom is within 64 pixels of the viewport
- **THEN** the timeline SHALL re-enter pinned mode
- **AND** the indicator SHALL hide
- **AND** the count SHALL reset to zero
