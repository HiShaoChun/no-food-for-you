# arena-ui — spec delta

## MODIFIED Requirements

### Requirement: Game Parameter Form
The system SHALL render form controls for every field in `GameConfig` except the agent list and shared_system_prompt (which have dedicated UI).

Controls:
- `initial_energy` — number input (default 10, min 1, max 100)
- `max_rounds` — number input (default 30, min 1, max 200)
- `max_requests_per_round` — number input (default 1, min 1, max 5)
- `pressure` — radio (constant / linear / step) + conditional parameter inputs
- `allocation_policy` — radio (fully_free / capped / proportional) + conditional `cap` input
- `master_seed` — number input with a "🎲 random" button

Removed in this change: `info_mode` radio + conditional `k` input. Agents now always see the full public history; there is no UI knob for visibility.

#### Scenario: Defaults render without errors
- **WHEN** the page first loads
- **THEN** all controls SHALL be populated with the defaults listed above
- **AND** no "信息模式" / `info_mode` control SHALL appear in the form
