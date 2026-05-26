# Design: add-pledge-betrayal

## D1. 两阶段回合模型

### 现状
当前 engine 单回合：buildView → 并行决策（1 次 LLM/agent，返回 request | respond | noop）→ settle（apply transfers, pressure, eliminate）。

### 新模型
单回合 7 步（在 engine 内部，对外仍是「一回合」概念）：

```
1. State broadcast (decision)         — buildDecisionView(state, agent)
2. Decision LLM call                  — Promise.all(agents.decide_phase(view))
3. Request aggregation                — route requests into THIS round's inboxes
4. State broadcast (response)         — buildResponseView(state', agent)  ← state' = state + 本回合 inbox
5. Response LLM call                  — Promise.all(agents.respond_phase(view))
6. Pledge settlement                  — check pending pledges, mark kept/defected, payout bonuses
7. Round settle                       — apply transfers, deduct pressure, eliminate, emit round_settled
```

关键差别于 Python 版：
- 我们让 inbox 在**同一回合内**被消费（步骤 3→4→5），不再有「1 回合延迟」。这是因为：(a) 当前 game 项目的 `request → next-round inbox → respond` 模型用户已经在 round-settled card 里习惯了"立刻看到结果"；(b) 同步消费让承诺的"下回合到期"语义更清晰（pledge 是跨回合的；request 是回合内的）。
- 这意味着 settle.ts 里现有「把 request 放进 nextInboxes」的逻辑要改成「放进当前回合的临时 inbox，立刻在 response phase 消费」。

### 取舍
- ✅ 用户已确认接受 token 翻倍
- ✅ 跨回合状态简化：pledge 是唯一跨回合的"债"，inbox 不再跨回合
- ⚠️ 这是对 Python 版的**轻微偏离**——Python 版 inbox 跨回合，pledge 也跨回合，两套延迟语义。我们用「inbox 同步、pledge 跨回合」更直觉，但行为不 100% 同构。

如果用户偏好严格同构，把步骤 3 改成 "route into next round's inbox"、步骤 4-5 移到「先消费上回合 inbox」即可。**默认选「同步 inbox」**——更适合 web 直播观感。

## D2. 类型设计

```ts
// lib/engine/pledge.ts (new file)

export type Pledge = {
  from: string;          // agent id
  to: string;
  amount: number;        // positive integer
  round_made: number;    // round when emitted
  due_round: number;     // = round_made + 1 (always, for now)
};

export type PledgeSettlement = {
  pledge: Pledge;
  actual: number;        // sum of actual transfers from→to in due_round
  status: "kept" | "defected";
  bonus_paid: number;    // signed integer; sign = sign of betrayal_bonus_table entry (or = keep_promise_bonus if kept)
};

export type DefectionRecord = {
  round_due: number;
  from: string;
  to: string;
  pledged: number;
  actual: number;
};

// lib/engine/types.ts (modifications)

export type DecisionAction = {
  phase: "decision";
  requests: { target: string; message: string }[];
  pledges: { to: string; amount: number }[];
  inner_thought: string;  // "" if none
};

export type ResponseAction = {
  phase: "response";
  allocations: Allocation[];
  pledges: { to: string; amount: number }[];
  inner_thought: string;
};

export type PhaseAction = DecisionAction | ResponseAction;

// AgentView 拆成两套
export type DecisionView = AgentViewBase & {
  phase: "decision";
  inbox: never[];        // decision phase 没有 inbox（inbox 同步消费在 response phase）
};

export type ResponseView = AgentViewBase & {
  phase: "response";
  inbox: InboxMessage[]; // 本回合 decision phase 路由进来的 request
};

export type AgentViewBase = {
  agent_id: string;
  round: number;
  max_rounds: number;
  self_energy: number;
  all_energies: Record<string, number>;
  history: HistoryEntry[];
  pressure_description: string;
  public_pledges: Pledge[];        // 当前 ledger
  pending_pledges: Pledge[];       // 本回合到期、由 self 发出的 pledge（即"你的债"）
  recent_defections: DefectionRecord[];
};

// GameState 新增
export type GameState = {
  // ... existing fields ...
  public_pledges: Pledge[];           // active pledges (not yet due)
  recent_defections: DefectionRecord[]; // permanent ledger
};

// GameConfig 新增
export type PledgesConfig = {
  enabled: boolean;                  // default true
  betrayal_bonus_table: number[];    // length ≥ 1; default [3, 1, 0, -2]
  keep_promise_bonus: number;        // default 0
};
```

### 红利表查表规则
`defector_count_to_bonus(n, table)`:
- n = 0 → 0（不会被调用，但安全返回）
- n ≥ 1 → `table[min(n-1, table.length-1)]`
- 即：1 → table[0]、2 → table[1]、3 → table[2]、4+ → table[3]
- 默认 table=[3,1,0,-2]：5 人也按 -2 算（保守地把"全员背叛"惩罚拉满）

### 旧 union 的去留
`AgentAction = RequestAction | RespondAction | NoopAction` 整个删除。Decision/Response 是独立的 phase action，不可能混淆。

## D3. Pledge 结算算法

```
fn settlePledges(state, decisionPledges, responseActions):
  # 1. 收集本回合新发出的 pledges（decision phase + response phase 都可发）
  new_pledges = decisionPledges ++ responseActions.flat_map(_.pledges)
  validated = new_pledges.filter(p => p.amount > 0 and p.to in alive and p.to != p.from)
  truncated = per_agent_per_phase_top3(validated)  # quota
  state.public_pledges ++= truncated_with_due_round_set
  
  # 2. 找出本回合到期的 pending pledges
  pending = state.public_pledges.filter(p => p.due_round == state.round)
  
  # 3. 对每条 pending pledge，计算 actual = sum(transfers where from=p.from, to=p.to)
  #    transfers 来自 responseActions（经过 policy 截断后的实际值）
  actual_map = build_actual_map(responseActions, transfers_after_policy)
  
  # 4. 标记 kept / defected
  settlements = []
  defectors_this_round = set()
  for p in pending:
    actual = actual_map.get((p.from, p.to), 0)
    if actual >= p.amount:
      settlements.append(PledgeSettlement(p, actual, "kept", bonus_paid = 0))  # bonus 下一步统一付
    else:
      settlements.append(PledgeSettlement(p, actual, "defected", bonus_paid = 0))
      defectors_this_round.add(p.from)
      state.recent_defections.append(DefectionRecord(state.round, p.from, p.to, p.amount, actual))
  
  # 5. Payout 背叛红利（每个 defector 拿一次，不论背叛了几条）
  n = len(defectors_this_round)
  bonus = lookup_table(n, config.betrayal_bonus_table)
  for d in defectors_this_round:
    energies[d] += bonus
    # 也把 bonus_paid 标在该 defector 任意一条 settlement 上（或单独 attribute）
  
  # 6. Payout 守约奖励（若 config.keep_promise_bonus > 0）
  if config.keep_promise_bonus > 0:
    for s in settlements where s.status == "kept":
      if s.pledge.to in alive:
        energies[s.pledge.to] += config.keep_promise_bonus
  
  # 7. 清除 pending pledges from public_pledges
  state.public_pledges = state.public_pledges.filter(p => p.due_round != state.round)
  
  return settlements
```

### 关键决策
- **背叛红利按 agent 计、不按 pledge 计**：一个 agent 一回合背叛了 3 条 pledge 也只拿一次红利。Python 版同此。
- **bonus 可以为负**（4+ 人时 -2）：直接扣能量，可能把 defector 扣死（与 pressure 一起触发 elimination）。
- **bonus 在 settle 之前 apply**：bonus / keep_promise → energies → 再 deduct pressure → eliminate。这保证「背叛大赚」能救一个本来要死的 agent，「全员背叛」会加速死亡。
- **守约 bonus 给接收方**：与 Python 版一致；这是「合作创造价值」的体现。默认 0 关闭。
- **policy_truncated 互动**：actual 用 policy 截断后的实际 transfer（不是 agent 声明的 allocation）。如果 capped policy 把你想守的承诺截短了 → 你被判背叛。这是 spec scenario 要测的边界。

## D4. Prompt 模板（参照 Python `SYSTEM_PROMPT_TEMPLATE`）

### Decision phase prompt 结构
```
{shared_system_prompt}

---
你是 {agent_id}。
当前回合: {round}/{max_rounds}（**决策阶段**）
你的 Energy: {self_energy}
所有 Agent Energy: {all_energies_json}
已淘汰: {eliminated_ids_or_无}
维持费: {pressure_description}

## 当前公开承诺
{public_pledges_block_or_无}

## ⚠️ 本回合到期的承诺（你欠的债）
{pending_pledges_block_or_无}
（注：到期承诺在本回合**响应阶段**结算；现在还能补救）

## 历史背叛记录
{recent_defections_block_or_无}

## 历史回合
{history_block}

---
这是**决策阶段**。请回复**纯 JSON 对象**：
{
  "requests": [{"target": "<id>", "message": "<≤30 字>"}],   // 最多 3 条
  "pledges":  [{"to": "<id>", "amount": <正整数>}],            // 最多 3 条；承诺下回合给
  "inner_thought": "<私密策略；只研究者看，可空字符串>"
}
```

### Response phase prompt 结构
```
{decision phase 同样 header}

## 本回合收到的 Request
{inbox_lines_or_无}

---
这是**响应阶段**。请回复**纯 JSON 对象**：
{
  "allocations": [{"to": "<id>", "amount": <非负整数>, "reason": "<≤30 字，可省>"}],
  "pledges":     [{"to": "<id>", "amount": <正整数>}],
  "inner_thought": "<私密；可空>"
}
**重要**：你本回合 pending_pledges 中的每条，若 allocation 中给该 to 的总额 < pledged，判**背叛**。
```

### DEFAULT_SHARED_SYSTEM_PROMPT 改造
保留现有"说话风格"段落（已在 [[tune-agent-voice]] 立项）；在它**之前**插入「pledge / 背叛红利」机制说明段，文本仿 Python `SYSTEM_PROMPT_TEMPLATE` 第 33-110 行——但保留 game 项目用户已习惯的「目标：活到最后」（Python 版是「能量最高者胜」的零和；我们仍是「活到最后」）。

红利数值在 prompt 里**写死**（与 config 同步默认 [+3,+1,0,-2]）；用户若改 config 的红利表，prompt 里不会自动更新，由用户在 textarea 里手动改。spec 不强制同步，避免「config → prompt 注入」这种隐式行为。

## D5. Event 流的变化

```ts
// 新事件
| { type: "agent_decision_phase"; sim_id; round; agent; raw; parsed: DecisionAction | null; parse_error?; tokens?; t }
| { type: "agent_response_phase"; sim_id; round; agent; raw; parsed: ResponseAction | null; parse_error?; tokens?; t }

// round_settled 扩展（旧字段不变）
| {
    type: "round_settled";
    // ... existing fields ...
    pledges_made_this_round: Pledge[];        // 本回合新发出的（已截断）
    pledges_settled_this_round: Array<{       // 本回合到期结算
      from: string;
      to: string;
      pledged: number;
      actual: number;
      status: "kept" | "defected";
      bonus_paid: number;  // 0 or keep_promise_bonus (kept) / table_value (defected, per-agent total / N_pledges_by_this_defector for fairness? — see D3)
    }>;
  }
```

`bonus_paid` 字段在 defected 条目里是「该 defector 本回合拿的总红利」，无论他背了几条都填一样的值（便于 UI 渲染）；kept 条目里是 keep_promise_bonus（0 表示没付）。

老的 `agent_decision` 事件类型**保留**但 deprecated（旧 JSONL replay 时识别 + 渲染），新 sim 不再发。

## D6. UI 概念草图

```
+----------------------- Arena (right) -----------------------+
|  ┌─ Header: token meter (decision / response 两栏)         |
|  │  · provider status banner                                |
|  │  · [研究者视角] toggle                                    |
|  ├─ Public Pledges (live) ─────────────────────────────────│
|  │  A1 → A2: 2 (due R5)                                    │
|  │  A3 → A1: 1 (due R5)                                    │
|  ├─ Defection Ledger ──────────────────────────────────────│
|  │  R3 A2 承诺给 A1 3 实给 0 (-3 背叛)                     │
|  │  R2 A4 承诺给 A2 1 实给 0 (-1 背叛)                     │
|  ├─ Chat Timeline ─────────────────────────────────────────│
|  │  ┌ A1 [decision]                                        │
|  │  │   request → A2: "给我 2"                            │
|  │  │   pledge ◆ → A3: 1 (R5 到期)                       │
|  │  │   [inner: 想骗 A3 信任，下回合再叛]   ← 仅研究者视角│
|  │  └─                                                      │
|  │  ┌ A2 [response]                                        │
|  │  │   → A1: 2 · "凑合给点"                              │
|  │  │   pledge ◆ → A1: 3 (R5 到期)                       │
|  │  └─                                                      │
|  │  ┌─ Round 4 settled ──────────────────────────────────│
|  │  │ A1 9→8 (-1) | A2 7→9 (+2) | ...                    │
|  │  │ transfers: A2→A1: 2                                 │
|  │  │ pledges settled:                                    │
|  │  │   • A4→A2: pledged 2 actual 0 [背叛 -2]             │
|  │  │   • A1→A3: pledged 1 actual 1 [守约]                │
|  │  │ pledges made: A1→A3: 1 (R5), A2→A1: 3 (R5)         │
|  │  └────                                                   │
+-------------------------------------------------------------+
```

## D7. 测试矩阵

| 场景 | 文件 | 重点 |
|---|---|---|
| Pledge parse + validation | tests/parse.test.ts | self-pledge / dead-target / amount<=0 / quota 截断 |
| Pledge ledger 推进 | tests/engine.test.ts | created → pending → kept/defected → 清除 |
| 1 defector → +3 | tests/engine.test.ts | 默认表 |
| 2 defectors → +1 each | tests/engine.test.ts | |
| 3 defectors → 0 each | tests/engine.test.ts | |
| 4 defectors → -2 each（含 elimination 联动）| tests/engine.test.ts | |
| 5+ defectors → 仍按表末项 -2 | tests/engine.test.ts | 边界 |
| Partial kept (actual=1, pledged=3) → defected | tests/engine.test.ts | "部分守约"不存在 |
| Multi-pledge same defector → 拿一次红利 | tests/engine.test.ts | 公平性 |
| Capped policy 截断导致被动背叛 | tests/engine.test.ts | policy 互动 |
| Response phase API 失败 → 所有 pending → defected | tests/engine.test.ts | 失败模式 |
| keep_promise_bonus=1 给接收方加能量 | tests/engine.test.ts | |
| inner_thought 不进 view/history/inbox | tests/view.test.ts | 隐私 |
| Public_pledges 进 next view | tests/view.test.ts | |
| Recent_defections 永久在 view | tests/view.test.ts | |
| Two-phase event 时序：decision_phase → response_phase → settled | tests/registry.test.ts | |
| Quota 截断标 policy_truncated | tests/parse.test.ts | |

预期单测从 69（现状）增到约 95+。

## D8. 与 [[remove-info-mode]] 的合并顺序
- **先合 remove-info-mode**（小、独立）→ rebase 本提案：本提案的 `GameConfig` delta 应在 info_mode 已删除的基线上写
- 若反过来先合本提案：remove-info-mode 在 rebase 时会发现本提案已修改 `Requirement: GameConfig Schema`，需要把 info_mode 删除合并进去
- 默认按 remove-info-mode 先合处理，tasks.md 也按此假设
