# arena-ui — spec delta

## MODIFIED Requirements

### Requirement: Game Parameter Form
The system SHALL render form controls for the user-tunable fields of `GameConfig` only. Fields that are derived, internal, or removed SHALL NOT appear in the form.

Visible controls:
- `initial_energy` — number input (default 10, min 1, max 100)
- `max_rounds` — number input (default 30, min 1, max 200)
- `info_mode` — radio (open / blind / partial) + conditional number input for `k`
- `pressure` — radio (constant / linear / step) + conditional parameter inputs
- `allocation_policy` — radio (fully_free / capped / proportional) + conditional `cap` input

Removed controls in this change:
- `max_requests_per_round` — field removed from `GameConfig`; no UI
- `master_seed` — auto-randomized on every Start (see "Auto-randomized Master Seed"); no UI

#### Scenario: Defaults render without errors
- **WHEN** the page first loads
- **THEN** all listed controls SHALL be populated with the defaults above
- **AND** no `max_requests_per_round` field SHALL appear
- **AND** no `master_seed` field SHALL appear

## ADDED Requirements

### Requirement: Auto-randomized Master Seed
The system SHALL replace `config.master_seed` with a fresh random integer immediately before POSTing to `/api/simulate`. The seed SHALL NOT be user-editable through the UI.

#### Scenario: Each Start uses a new seed
- **WHEN** the user clicks Start twice in succession with the same config
- **THEN** the two simulations SHALL run with two different `master_seed` values
- **AND** each run's `sim_started` event SHALL record the seed used (for reproducibility)

#### Scenario: Seed is not in the form
- **WHEN** the user inspects the Config Panel
- **THEN** no input control SHALL exist for `master_seed`
- **AND** no 🎲 button SHALL exist
