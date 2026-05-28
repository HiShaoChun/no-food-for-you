# simulation-engine — delta

## MODIFIED Requirements

### Requirement: Round-based State Machine
The system SHALL run simulations as a sequence of discrete rounds. Each round SHALL execute the following phases in order, with no concurrent side effects across rounds.

Phases (per round):
1. **Decision state broadcast** — build a per-agent `DecisionView` containing the full public history, the public pledge ledger, the agent's pending pledges (due this round), and the defection ledger
2. **Decision LLM call** — the engine SHALL first emit one `agent_decision_started` event per living agent (in any deterministic order, e.g. config order) BEFORE dispatching any LLM call this phase. Each living agent SHALL then produce a `DecisionAction` (`{requests, pledges, inner_thought}`); calls within a single round MAY execute in parallel. The engine SHALL emit each agent's `agent_decision_phase` event AS SOON AS that agent's LLM call resolves (success or failure-as-noop), NOT after waiting for the entire phase to finish. The phase ends only when every living agent has emitted its `agent_decision_phase` event.
3. **Request aggregation** — collect all `requests` from this round's decisions and route them into the same round's inboxes (synchronous consumption, not next-round)
4. **Response state broadcast** — build a per-agent `ResponseView` containing everything in `DecisionView` PLUS this round's inbox
5. **Response LLM call** — the engine SHALL first emit one `agent_response_started` event per living agent (in any deterministic order) BEFORE dispatching any LLM call this phase. Each living agent SHALL then produce a `ResponseAction` (`{allocations, pledges, inner_thought}`); calls MAY execute in parallel. The engine SHALL emit each agent's `agent_response_phase` event AS SOON AS that agent's LLM call resolves, NOT after waiting for the entire phase. The phase ends only when every living agent has emitted its `agent_response_phase` event.
6. **Pledge settlement** — add new pledges to `public_pledges` (with `due_round = state.round + 1`); settle pending pledges by comparing actual policy-truncated transfers against pledged amounts; compute betrayal bonuses and apply to defector energies; apply keep-promise bonuses to receivers if enabled; drop settled pending pledges
7. **Round settle** — apply transfers (policy-truncated), deduct pressure cost, mark eliminations, emit `round_settled` event

#### Scenario: Phases execute in order
- **WHEN** a round runs
- **THEN** phases 1–7 SHALL execute strictly in the order listed
- **AND** no phase SHALL begin until the previous phase has completed for ALL living agents

#### Scenario: Decision phase parallelism within a round
- **WHEN** decision phase runs for round N with K living agents
- **THEN** the engine MAY launch all K decision LLM calls concurrently
- **AND** SHALL wait for all K `agent_decision_phase` events to be emitted before phase 3 begins

#### Scenario: Per-agent decision events emit on completion, not in batch
- **WHEN** in round N two agents A1 and A2 are dispatched concurrently in the decision phase
- **AND** A1's LLM call resolves 200 ms before A2's
- **THEN** A1's `agent_decision_phase` event SHALL be emitted (passed to `opts.emit`) before A2's `agent_decision_phase` event
- **AND** A2's `agent_decision_phase` event SHALL NOT be delayed until A1 has also emitted (the engine MUST NOT collect both into a batch before emitting)

#### Scenario: All started events precede any phase event within the same phase
- **WHEN** the decision phase begins for round N
- **THEN** every living agent's `agent_decision_started` event SHALL be emitted before ANY `agent_decision_phase` event for round N is emitted
- **AND** the same property SHALL hold for `agent_response_started` versus `agent_response_phase`

#### Scenario: Per-agent response started precedes all decision phase events being complete
- **WHEN** in round N agent A1's decision LLM call resolves first
- **THEN** A1's `agent_decision_phase` event SHALL emit immediately
- **BUT** no `agent_response_started` event SHALL emit until EVERY living agent's `agent_decision_phase` event for round N has been emitted (phase boundary is strict)

#### Scenario: Inbox routed synchronously within same round
- **WHEN** agent A1 in round N's decision phase produces a `request` targeting A2
- **THEN** A2's `ResponseView.inbox` for round N SHALL contain that request
- **AND** A2's response phase output MAY allocate energy in reply within the same round N

#### Scenario: No cross-round concurrency
- **WHEN** round N is executing
- **THEN** no state mutation for round N+1 SHALL occur until round N's settlement completes

#### Scenario: LLM call failure becomes parsed-null phase event, not a missing event
- **WHEN** in round N agent A1's decision LLM call throws (network error, 401, etc.)
- **THEN** the engine SHALL still emit an `agent_decision_phase` event for A1 with `parsed: null` and a `parse_error` describing the failure
- **AND** the engine SHALL NOT swallow the failure as a missing event (which would leave the UI placeholder unreplaced forever)

#### Scenario: round_settled emits only after all phase events
- **WHEN** round N's response phase completes for all living agents
- **THEN** the `round_settled` event SHALL emit only AFTER every `agent_response_phase` event for round N has been emitted
