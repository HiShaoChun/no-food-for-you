# arena-ui (delta)

## ADDED Requirements

### Requirement: Visual Design System
The system SHALL apply a documented design token set (colors, typography, spacing, radii) to all UI surfaces. The token set SHALL be defined as CSS custom properties on `:root` in `app/globals.css` and consumed by all React components rather than hard-coded literals.

The required token families are:

- **Surfaces**: `--bg`, `--bg-elevated`, `--surface`, `--surface-2`, `--surface-hover`, `--border`, `--border-strong`
- **Text**: `--text`, `--text-dim`, `--text-faint`
- **Semantic**: `--accent`, `--accent-strong`, `--success`, `--danger`, `--warning`, `--noop`
- **Agent palette**: `--A1` … `--A10` — must remain semantically stable (same hue family across releases) so historical screenshots stay legible
- **Type scale**: `--fs-xs` … `--fs-xl`, `--font-sans`, `--font-mono`
- **Geometry**: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill`

#### Scenario: Tokens defined and consumed
- **WHEN** any component renders a colored surface, text element, or border
- **THEN** the value SHALL come from a CSS variable defined under `:root`
- **AND** no component SHALL hard-code a hex/rgb literal for color outside `globals.css`

#### Scenario: Agent identity color is consistent
- **WHEN** agent `A3` is displayed in the agent picker, in a chat bubble avatar, and as a line in the energy chart
- **THEN** all three locations SHALL use the same `--A3` token

#### Scenario: Numeric values use tabular figures
- **WHEN** the UI displays numeric values that update in real time (token counters, energy values, round number, event count)
- **THEN** the displayed text SHALL use `font-variant-numeric: tabular-nums` (or `font-feature-settings: "tnum" 1`) so digits do not reflow as values change

### Requirement: Sim Status Indicator
The system SHALL render a sim status chip in the page header that reflects the current simulation lifecycle: `idle` (no sim started this session), `running` (sim in progress), or `ended:<reason>` (most recent sim finished). The chip SHALL be visually distinct per state (color + label).

#### Scenario: Idle on first load
- **WHEN** the page is loaded and no simulation has been started
- **THEN** the chip SHALL show "Idle" with a neutral style

#### Scenario: Running during sim
- **WHEN** the Start button is clicked and the sim is in progress
- **THEN** the chip SHALL show "Running" with an active style (e.g. accent color, optional pulse)

#### Scenario: Ended after sim completes
- **WHEN** a `sim_ended` event has been received
- **THEN** the chip SHALL show "Ended · <reason>" where `<reason>` mirrors the event's reason field

## MODIFIED Requirements

### Requirement: Provider Status Banner
The system SHALL render a status indicator at the top of the page for each configured LLM provider. The indicator SHALL clearly distinguish "configured" from "not configured" using both color and an icon/dot — not color alone (accessibility).

#### Scenario: All providers configured
- **WHEN** all 5 `*_API_KEY` env vars are set
- **THEN** the banner SHALL show 5 indicators, all in the configured state (success-colored dot + label)

#### Scenario: Only ark configured
- **WHEN** only `ARK_API_KEY` is set
- **THEN** the banner SHALL show ark in the configured state and the other 4 in the unconfigured state (faint label + hollow dot)
- **AND** the unconfigured indicators SHALL show a tooltip "请在 .env 配置 <ENV_KEY_NAME>"

### Requirement: Chat Bubble Timeline
The system SHALL render LLM interactions as a vertically scrolling timeline of chat bubbles, grouped by round. Each bubble SHALL include: (a) a colored avatar matching the agent's identity token, (b) the agent's display_name, (c) a small action chip labelling the action kind, and (d) the action payload (message text or allocation list).

The action chip SHALL use these labels and colors:
- `REQUEST` — accent
- `ALLOCATE` — success
- `NOOP` — noop/neutral
- `ERROR` — danger

#### Scenario: Request bubble
- **WHEN** an `agent_decision` event arrives with `parsed.action === "request"`
- **THEN** a bubble SHALL appear with the source agent's avatar + display_name + a `REQUEST` chip
- **AND** the body SHALL include "→ <target display_name>" and the message text

#### Scenario: Respond bubble
- **WHEN** an `agent_decision` event arrives with `parsed.action === "respond"`
- **THEN** a bubble SHALL appear with the source agent's avatar + display_name + an `ALLOCATE` chip
- **AND** the body SHALL list each allocation as "→ <to display_name>: <amount>"

#### Scenario: Noop or parse_error
- **WHEN** an `agent_decision` event arrives with `parsed === null` or `parsed.action === "noop"`
- **THEN** a bubble SHALL appear with a `NOOP` or `ERROR` chip and dim styling
- **AND** when there is a `parse_error`, the raw LLM text SHALL be available behind a "show raw" expand toggle

### Requirement: Energy Line Chart
The system SHALL render a line chart showing each agent's energy over rounds. The chart SHALL update incrementally as `round_settled` events arrive. The chart SHALL apply the project's design tokens: grid stroke uses `--border`, axis ticks use `--font-mono` at `--fs-xs` in `--text-dim`, lines use the agent identity tokens.

#### Scenario: One line per agent
- **WHEN** the config has N agents
- **THEN** the chart SHALL show N distinct lines colored by their agent identity token
- **AND** the legend SHALL show each agent's display_name with a matching color swatch

#### Scenario: Eliminated agent line stops
- **WHEN** an agent is eliminated at round T
- **THEN** that agent's line SHALL terminate at the last settled point and not extend further

#### Scenario: Tooltip on hover
- **WHEN** the user hovers a point on the chart
- **THEN** a tooltip SHALL appear showing the round number and each agent's energy value at that round, with each row preceded by its identity color swatch
