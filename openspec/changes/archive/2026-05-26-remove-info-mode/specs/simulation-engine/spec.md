# simulation-engine — spec delta

## REMOVED Requirements

### Requirement: Information Modes
The system SHALL build each agent's per-round view according to the configured information mode.

Reason: `info_mode` removed from `GameConfig`. The view now always carries the full request/allocation history of all agents since round 1. Future research-mode toggling, if needed, will be reintroduced via a new change.

## MODIFIED Requirements

### Requirement: Round-based State Machine
The system SHALL run simulations as a sequence of discrete rounds. Each round SHALL execute the following phases in order, with no concurrent side effects across rounds.

Phases:
1. **State broadcast** — build a per-agent view containing the full public history since round 1
2. **Decision** — each agent produces ONE action (Request / Respond / No-op); decisions within a single round MAY execute in parallel
3. **Request aggregation** — collect all `Request` actions and route to target inboxes for the next round
4. **Response execution** — apply `Respond` actions (allocations) declared in this round (responding to inbox carried from the previous round)
5. **Settlement** — apply pressure cost, transfer energy, evaluate eliminations

> **MVP simplification (informative):** the engine MAY combine phase ② Decision and phase ④ Response into a single LLM call per agent per round, asking the agent for one action that can be either a request or a response. Inbox routing then introduces a 1-round delay between request and response. This is an implementation choice, not a spec constraint.

#### Scenario: Round phases execute in order
- **WHEN** a round runs
- **THEN** state broadcast SHALL precede decision, decision SHALL precede aggregation, aggregation SHALL precede response, response SHALL precede settlement

#### Scenario: No cross-round concurrency
- **WHEN** round N is executing
- **THEN** no state mutation for round N+1 SHALL occur until round N's settlement completes

### Requirement: Reason Propagates Into Subsequent Round Views
The system SHALL include the `reason` of each transfer (if present) in the per-agent view that the next round's decision phase receives, so agents can incorporate prior allocation reasons into their reasoning.

#### Scenario: Reason appears in history for next round's view
- **WHEN** in round N agent A1 allocates `{to:"A2",amount:2,reason:"看你能撑两轮"}` (applied)
- **AND** the simulation continues to round N+1
- **THEN** the view passed to agents in round N+1 SHALL surface the transfer entry from round N with its reason
