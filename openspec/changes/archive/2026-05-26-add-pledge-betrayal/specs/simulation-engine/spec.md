# simulation-engine — spec delta

## MODIFIED Requirements

### Requirement: Round-based State Machine
The system SHALL run simulations as a sequence of discrete rounds. Each round SHALL execute the following phases in order, with no concurrent side effects across rounds.

Phases (per round):
1. **Decision state broadcast** — build a per-agent `DecisionView` containing the full public history, the public pledge ledger, the agent's pending pledges (due this round), and the defection ledger
2. **Decision LLM call** — each living agent produces a `DecisionAction` (`{requests, pledges, inner_thought}`); calls within a single round MAY execute in parallel
3. **Request aggregation** — collect all `requests` from this round's decisions and route them into the same round's inboxes (synchronous consumption, not next-round)
4. **Response state broadcast** — build a per-agent `ResponseView` containing everything in DecisionView PLUS this round's inbox
5. **Response LLM call** — each living agent produces a `ResponseAction` (`{allocations, pledges, inner_thought}`); MAY execute in parallel
6. **Pledge settlement** — (a) add all new pledges (decision + response) to `public_pledges` with `due_round = state.round + 1`; (b) settle pending pledges (those whose `due_round === state.round`) by comparing actual policy-truncated transfers against pledged amounts; (c) compute betrayal bonuses and apply to defector energies; (d) compute keep-promise bonuses and apply to receiver energies if enabled; (e) drop settled pending pledges from the ledger
7. **Round settle** — apply transfers (policy-truncated), deduct pressure cost, mark eliminations, emit `round_settled` event

#### Scenario: Phases execute in order
- **WHEN** a round runs
- **THEN** phases 1–7 SHALL execute strictly in the order listed
- **AND** no phase SHALL begin until the previous phase has completed for ALL living agents

#### Scenario: Decision phase parallelism within a round
- **WHEN** decision phase runs for round N with K living agents
- **THEN** the engine MAY launch all K decision LLM calls concurrently
- **AND** SHALL wait for all to settle before phase 3 begins

#### Scenario: Inbox routed synchronously within same round
- **WHEN** agent A1 in round N's decision phase produces a `request` targeting A2
- **THEN** A2's `ResponseView.inbox` for round N SHALL contain that request
- **AND** A2's response phase output MAY allocate energy in reply within the same round N

### Requirement: Round Settlement Emits Reconcilable Detail
The system SHALL emit a `round_settled` event at the end of every round that contains sufficient detail for a frontend to reconstruct the round's outcome WITHOUT replaying decisions.

Fields:
- `round` — the round number that just settled
- `prev_energies` — every registered agent's energy at round-start (before transfers, bonuses, and pressure deduction)
- `energies` — every registered agent's energy at round-end (after settlement); eliminated agents appear at 0
- `transfers` — array of `{ from, to, amount, reason? }` records describing every actual integer energy transfer applied this round (already truncated/scaled per allocation policy). `reason` is optional.
- `pressure_cost` — the integer maintenance fee deducted from each living agent this round
- `eliminated` — agent IDs newly eliminated this round (not the cumulative set)
- `pledges_made_this_round` — array of `{ from, to, amount, round_made, due_round }` records describing all pledges newly created this round (decision + response phases combined, post-validation, post-quota-truncation)
- `pledges_settled_this_round` — array of `{ from, to, pledged, actual, status: "kept" | "defected", bonus_paid }` records describing every pending pledge that matured this round. `bonus_paid` for a `defected` entry is the per-defector betrayal payout for this round (same value for all entries with the same `from`); for `kept` it is `keep_promise_bonus` paid to the receiver (0 if disabled).
- `t` — ISO-8601 timestamp

#### Scenario: Settled event includes pledge ledgers
- **WHEN** a round settles
- **THEN** `pledges_made_this_round` and `pledges_settled_this_round` SHALL each be arrays (possibly empty, never undefined)

#### Scenario: Settled event prev_energies snapshot
- **WHEN** a round settles
- **THEN** `prev_energies` SHALL equal the energy map as it was at the start of this round (i.e., the `energies` field of the previous `round_settled` event, or `initial_energy` for all agents on round 1)

#### Scenario: Transfers reflect actual policy-applied amounts
- **WHEN** an agent declared `{"allocations":[{"to":"A2","amount":10}]}` but the `capped` policy with `cap=2` is in effect
- **THEN** `transfers` SHALL contain `{ from: "<responder>", to: "A2", amount: 2 }`
- **AND** SHALL NOT contain the agent-declared value of 10

#### Scenario: No transfers means empty array
- **WHEN** a round had no successful allocations
- **THEN** `transfers` SHALL be `[]` (never `undefined` or missing)

#### Scenario: Transfer carries allocation reason when present
- **WHEN** an agent allocated `{"to":"A2","amount":3,"reason":"看你还能撑两轮"}` and the engine applied it
- **THEN** the matching `transfers` entry SHALL include `reason: "看你还能撑两轮"`

#### Scenario: Eliminated agent at zero appears in energies
- **WHEN** an agent is eliminated this round
- **THEN** `eliminated` SHALL list that agent's ID
- **AND** `energies[<id>]` SHALL equal 0

#### Scenario: Pledges created in either phase appear in pledges_made
- **WHEN** in round N agent A1 emits `pledges:[{to:"A2",amount:2}]` in the decision phase and A2 emits `pledges:[{to:"A1",amount:1}]` in the response phase
- **THEN** `round_settled.pledges_made_this_round` SHALL contain both entries with `round_made: N, due_round: N+1`

## ADDED Requirements

### Requirement: Pledge Lifecycle
The system SHALL treat each pledge as a state-machine transitioning created → pending → kept | defected. The transitions SHALL be triggered exclusively by the engine, never by agents.

State definitions:
- **created**: pledge emitted by an agent (in decision or response phase); validated and added to `public_pledges` with `due_round = round_emitted + 1`. Immediately public to all agents.
- **pending**: a pledge whose `due_round` equals the current round being settled. Listed in the pledger's `ResponseView.pending_pledges`.
- **kept**: at pledge settlement, the actual sum of transfers from the pledger to the recipient in the maturing round was ≥ the pledged amount.
- **defected**: at pledge settlement, the actual sum was < the pledged amount (including 0).

Once settled (kept or defected), the pledge SHALL be removed from `public_pledges`.

#### Scenario: Newly emitted pledge appears in public ledger next round
- **WHEN** A1 emits `pledges:[{to:"A2",amount:2}]` in round 3's decision phase
- **THEN** `state.public_pledges` after round 3 settles SHALL contain `{from:"A1",to:"A2",amount:2,round_made:3,due_round:4}`
- **AND** the DecisionView for every agent in round 4 SHALL include this pledge in `public_pledges`

#### Scenario: Pending pledge surfaces in pledger's pending_pledges
- **WHEN** state.public_pledges contains the pledge above and round 4 begins
- **THEN** A1's `ResponseView.pending_pledges` for round 4 SHALL include that pledge
- **AND** no other agent's `pending_pledges` SHALL include it (it's A1's debt)

#### Scenario: Settled pledge is dropped from ledger
- **WHEN** round 4 settles and A1's pledge is marked kept or defected
- **THEN** `state.public_pledges` after round 4 SHALL NOT contain that pledge

### Requirement: Self and Dead-Target Pledges Are Dropped
The system SHALL drop any pledge whose `to` equals the pledger's own id, or whose `to` is not a currently-living agent at the time of pledge emission.

#### Scenario: Self-pledge dropped
- **WHEN** A1 emits `pledges:[{to:"A1",amount:5}]`
- **THEN** the engine SHALL drop the pledge silently (not added to public_pledges)

#### Scenario: Dead-target pledge dropped
- **WHEN** A3 was eliminated in round 2 and A1 emits `pledges:[{to:"A3",amount:1}]` in round 3
- **THEN** the engine SHALL drop the pledge silently

#### Scenario: Zero or negative amount dropped
- **WHEN** A1 emits `pledges:[{to:"A2",amount:0}]` or `{amount:-1}`
- **THEN** the engine SHALL drop the pledge silently

### Requirement: Defection Detection at Pledge Maturity
The system SHALL settle pending pledges in the round their `due_round` equals, comparing the pledged amount against the sum of actual integer transfers from the pledger to the recipient applied THIS round.

#### Scenario: Actual ≥ pledged → kept
- **WHEN** A1 pledged 2 to A2 in round 3 (due round 4) AND in round 4's response phase the engine applies a transfer `{from:"A1",to:"A2",amount:2}` (or more)
- **THEN** the pledge SHALL be marked `kept`

#### Scenario: Actual < pledged → defected
- **WHEN** A1 pledged 3 to A2 in round 3 AND in round 4 the engine applies a transfer `{from:"A1",to:"A2",amount:1}`
- **THEN** the pledge SHALL be marked `defected` with `actual=1, pledged=3`

#### Scenario: No transfer at all → defected
- **WHEN** A1 pledged 2 to A2 in round 3 AND no transfer from A1 to A2 is applied in round 4
- **THEN** the pledge SHALL be marked `defected` with `actual=0`

#### Scenario: Policy truncation can cause defection
- **WHEN** A1 pledged 5 to A2, allocates `{to:"A2",amount:5}` in round 4, but `allocation_policy=capped` with `cap=2` truncates the actual transfer to 2
- **THEN** the pledge SHALL be marked `defected` with `actual=2, pledged=5`
- **AND** the engine SHALL NOT use the agent-declared allocation amount (5) for defection determination

#### Scenario: Response phase parse failure → all pending pledges defected
- **WHEN** A1 has pending pledges in round 4 AND A1's response phase LLM call fails or produces unparseable output
- **THEN** A1 SHALL be treated as making 0 allocations
- **AND** every pending pledge by A1 SHALL be marked `defected`

#### Scenario: Multiple transfers same direction sum
- **WHEN** A1 pledged 4 to A2 AND A1's allocations contain `[{to:"A2",amount:2},{to:"A2",amount:3}]` and both are applied
- **THEN** `actual` SHALL equal 5 and the pledge SHALL be `kept`

### Requirement: Betrayal Bonus Payout
The system SHALL count the distinct number of defectors in each round and pay each defector a bonus (possibly negative) looked up from `config.pledges.betrayal_bonus_table`. The bonus SHALL apply BEFORE pressure deduction and elimination.

Table lookup rule:
- N defectors this round → bonus per defector = `table[min(N - 1, table.length - 1)]`
- Defaults: `table = [3, 1, 0, -2]` (1 → +3, 2 → +1, 3 → 0, 4 or more → -2)
- Each defector receives ONE bonus per round regardless of how many of their pledges defaulted this round

#### Scenario: Lone defector receives +3
- **WHEN** exactly 1 agent defects this round AND table = [3,1,0,-2]
- **THEN** that agent's energy SHALL increase by 3

#### Scenario: Two defectors each receive +1
- **WHEN** A1 and A2 each defect at least one pledge this round AND table = [3,1,0,-2]
- **THEN** A1.energy SHALL increase by 1 AND A2.energy SHALL increase by 1

#### Scenario: Three defectors each receive 0
- **WHEN** 3 distinct agents defect this round AND table = [3,1,0,-2]
- **THEN** no defector's energy SHALL change from the bonus

#### Scenario: Four or more defectors each receive -2 (table's last entry)
- **WHEN** 4, 5, ..., 10 distinct agents defect this round AND table = [3,1,0,-2]
- **THEN** EACH defector SHALL lose 2 energy (the last table entry repeats for any N ≥ length)

#### Scenario: Defector with multiple defected pledges still receives one bonus
- **WHEN** A1 has 2 defected pledges this round AND no other agent defects
- **THEN** A1 SHALL receive +3 ONCE (not +6)

#### Scenario: Bonus may push energy into elimination
- **WHEN** an agent has energy 1 going into bonus payout, the table value is -2 (4+ defectors), and pressure_cost is 1
- **THEN** after bonus (energy = -1) and pressure (energy = -2), the agent SHALL be eliminated

#### Scenario: Betrayal bonus disabled by empty table
- **WHEN** `config.pledges.enabled === false`
- **THEN** no pledges SHALL be added to `public_pledges` regardless of agent output
- **AND** no betrayal or keep-promise bonus SHALL be paid

### Requirement: Keep-Promise Bonus
The system SHALL pay the recipient of a kept pledge `config.pledges.keep_promise_bonus` energy if and only if the configured value is > 0. The bonus SHALL apply BEFORE pressure deduction.

#### Scenario: Default keep_promise_bonus = 0 → no payout
- **WHEN** the config uses the default `keep_promise_bonus: 0` and A1 keeps a pledge to A2
- **THEN** A2's energy SHALL NOT change from this bonus

#### Scenario: keep_promise_bonus = 1 → receiver +1
- **WHEN** `keep_promise_bonus: 1` and A1 keeps a pledge to A2
- **THEN** A2's energy SHALL increase by 1 in this round's settlement

#### Scenario: Dead receiver receives no bonus
- **WHEN** A2 was eliminated this round (e.g., by pressure before bonus order, though spec orders bonus BEFORE pressure) — in any case the receiver must be alive at the time of bonus application
- **THEN** no bonus SHALL be paid

### Requirement: Public Pledge Ledger and Defection Ledger
The system SHALL maintain two ledgers in `GameState`:
- `public_pledges: Pledge[]` — currently active pledges (created but not yet settled)
- `recent_defections: DefectionRecord[]` — append-only list of every defection ever recorded in this simulation

Both ledgers SHALL be included in every agent's view (decision and response phases).

#### Scenario: Defection record persists for full simulation
- **WHEN** a pledge defects in round N
- **THEN** a `DefectionRecord{round_due: N, from, to, pledged, actual}` SHALL be appended to `state.recent_defections`
- **AND** that record SHALL appear in every subsequent agent view's `recent_defections`

#### Scenario: Public pledge ledger reflects only active pledges
- **WHEN** round N settles and a pledge created in round N-1 is settled
- **THEN** `state.public_pledges` for round N+1 SHALL NOT contain that pledge
- **AND** any pledges created in round N that mature in round N+1 SHALL appear

### Requirement: Per-Round Per-Phase Pledge Quota
The system SHALL truncate each agent's emitted pledges to at most 3 per phase (decision OR response). Excess SHALL be silently dropped from the tail of the array.

#### Scenario: Five pledges in one phase → keep first 3
- **WHEN** A1 emits `pledges:[p1,p2,p3,p4,p5]` in the decision phase
- **THEN** only `p1, p2, p3` SHALL be added to `public_pledges`
- **AND** the `agent_decision_phase` event SHALL include `policy_truncated: true`

#### Scenario: Three in decision + three in response is allowed
- **WHEN** A1 emits 3 pledges in decision AND 3 pledges in response
- **THEN** all 6 SHALL be added to `public_pledges` (quota is per-phase, not per-round)
