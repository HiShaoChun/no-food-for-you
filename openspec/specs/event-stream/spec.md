# event-stream

## Requirements

### Requirement: Event Type Enumeration
The system SHALL emit one of five event types during a simulation. Every event SHALL include `type`, `sim_id`, and ISO-8601 `t` (timestamp) fields.

The five types are:
- `sim_started` — emitted exactly once at simulation start
- `round_started` — emitted at the start of each round
- `agent_decision` — emitted once per agent per round
- `round_settled` — emitted once per round after settlement
- `sim_ended` — emitted exactly once at termination

#### Scenario: sim_started fields
- **WHEN** a simulation begins
- **THEN** the first event SHALL have `type: "sim_started"` and SHALL include the full `GameConfig` under a `config` field

#### Scenario: agent_decision fields
- **WHEN** an agent's decision for round N is processed
- **THEN** an `agent_decision` event SHALL include `round`, `agent`, `raw` (LLM raw text), `parsed` (the typed action or null), and optional `tokens: {input, output}` if available

#### Scenario: round_settled fields
- **WHEN** round N's settlement completes
- **THEN** a `round_settled` event SHALL include `round: N`, `energies` (post-settlement map of all agent IDs to integer energies including eliminated ones at 0), and `eliminated` (list of agent IDs newly eliminated this round)

#### Scenario: sim_ended fields
- **WHEN** the simulation terminates
- **THEN** a `sim_ended` event SHALL include `reason: "max_rounds" | "all_eliminated" | "one_survivor"` and `survivors` (list of agent IDs with energy > 0)

### Requirement: Server-Sent Events Endpoint
The system SHALL expose `GET /api/events/<sim_id>` returning a `text/event-stream` response. Each SSE message body SHALL be a single JSON-encoded event.

#### Scenario: SSE format compliance
- **WHEN** a client connects to `GET /api/events/<sim_id>`
- **THEN** the response Content-Type SHALL be `text/event-stream`
- **AND** each event SHALL be sent as `data: <single-line JSON>\n\n`

#### Scenario: Unknown sim_id
- **WHEN** a client connects with an unknown `sim_id`
- **THEN** the server SHALL respond with HTTP 404

#### Scenario: Late subscriber receives backlog
- **WHEN** a client connects to `/api/events/<sim_id>` after the simulation has already emitted some events
- **THEN** the server SHALL replay all prior events from the JSONL file, in order, before streaming new ones

### Requirement: JSONL Archive
The system SHALL write every emitted event as a single line of JSON to `runs/<sim_id>.jsonl`. The file SHALL be append-only during a simulation and SHALL be readable by future replay tooling.

#### Scenario: One event = one line
- **WHEN** an event is emitted
- **THEN** exactly one line SHALL be appended to `runs/<sim_id>.jsonl`
- **AND** the line SHALL be valid JSON parseable to the same structure delivered over SSE

#### Scenario: File closed cleanly on termination
- **WHEN** `sim_ended` is emitted
- **THEN** the JSONL file's last line SHALL be the `sim_ended` event
- **AND** the file handle SHALL be closed before the SSE stream terminates

### Requirement: POST /api/simulate
The system SHALL expose `POST /api/simulate` accepting a `GameConfig` in the body and returning `{ "sim_id": string }`. The simulation SHALL begin running in the background; the HTTP response SHALL NOT wait for completion.

#### Scenario: Successful start
- **WHEN** a client POSTs a valid `GameConfig`
- **THEN** the server SHALL generate a `sim_id` (UUID v4)
- **AND** SHALL register the simulation in the in-memory `SimulationRegistry`
- **AND** SHALL respond with `200 { "sim_id": "<uuid>" }` before any rounds run

#### Scenario: Invalid config
- **WHEN** a client POSTs a body that fails Zod validation against `GameConfig`
- **THEN** the server SHALL respond with `400` and a body describing the validation error

#### Scenario: Missing provider key
- **WHEN** a client POSTs a config referencing a model whose provider has no `.env` key configured
- **THEN** the server SHALL respond with `400` and message `"provider <name> not configured"`

### Requirement: In-memory Simulation Registry
The system SHALL maintain a process-local Map from `sim_id` to an event emitter. The registry SHALL NOT persist across process restarts.

#### Scenario: Registry survives concurrent simulations
- **WHEN** 3 simulations are running concurrently
- **THEN** the registry SHALL hold 3 distinct entries
- **AND** events emitted by one simulation SHALL NOT leak into another's subscriber

#### Scenario: Registry cleared after sim_ended
- **WHEN** a simulation emits `sim_ended` and all SSE subscribers have disconnected or 60 seconds have elapsed since termination (whichever is later)
- **THEN** the registry entry SHALL be removed
- **AND** the JSONL file SHALL remain on disk

### Requirement: No PII or Key Leakage in Events
The system SHALL NOT include any API key, request header, or full URL with credentials in any event payload.

#### Scenario: Raw LLM output sanitization
- **WHEN** the `agent_decision.raw` field is populated
- **THEN** it SHALL contain only the LLM's response text
- **AND** SHALL NOT contain the request payload or any auth header
