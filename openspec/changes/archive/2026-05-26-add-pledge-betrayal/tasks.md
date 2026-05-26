# Tasks: add-pledge-betrayal

按 phase 顺序推进。每 phase 完成后跑一遍 `pnpm typecheck && pnpm test` 确保不破坏前一个 phase。

## Phase A: 类型与配置

- [ ] **A.1** `lib/engine/pledge.ts`：新建。导出 `Pledge`、`PledgeSettlement`、`DefectionRecord` 类型，导出 `lookupBetrayalBonus(defectorCount, table)` 纯函数
- [ ] **A.2** `lib/engine/types.ts`：新增 `PledgesConfig`、`DecisionAction`、`ResponseAction`、`PhaseAction`、`DecisionView`、`ResponseView`、`AgentViewBase`
- [ ] **A.3** `lib/engine/types.ts`：废弃 `AgentAction`（保留导出但加 `@deprecated` 注释，UI 还要用来兼容老 JSONL）
- [ ] **A.4** `lib/engine/types.ts`：`GameConfig` 加 `pledges: PledgesConfig`
- [ ] **A.5** `lib/engine/types.ts`：`GameState` 加 `public_pledges: Pledge[]`、`recent_defections: DefectionRecord[]`
- [ ] **A.6** `lib/engine/types.ts`：`SimEvent` union 加 `agent_decision_phase`、`agent_response_phase` 两种事件；`round_settled` 扩展 `pledges_made_this_round` / `pledges_settled_this_round` 字段；保留 `agent_decision` 在 union 里供老 JSONL 反序列化用，但代码不再发
- [ ] **A.7** `lib/config-schema.ts`：新增 `PledgeSchema`、`PledgesConfigSchema`；`GameConfigSchema` 加 `pledges` 字段，默认 `{enabled:true, betrayal_bonus_table:[3,1,0,-2], keep_promise_bonus:0}`
- [ ] **A.8** `app/page.tsx`：`defaultConfig()` 加 `pledges` 默认值

## Phase B: Parser

- [ ] **B.1** `lib/agents/parse.ts`：新增 `parseDecisionAction(raw, ctx) → {parsed, parse_error?, policy_truncated?}`；ctx 含 `self_id`, `alive_set`
- [ ] **B.2** `lib/agents/parse.ts`：新增 `parseResponseAction(raw, ctx)`；同上
- [ ] **B.3** Parser 共享逻辑：strip markdown fence、JSON.parse → 校验字段类型、过滤非法 pledge（self / dead / amount<=0）、quota 截断（每阶段 ≤3 pledge，≤3 request/allocation 同步加，allocation 暂无上限以保持向后兼容）、`inner_thought` 不在则补 `""`
- [ ] **B.4** 老的 `parseAction` 标 `@deprecated`，暂留供老 JSONL replay（如果 stats/aggregate 仍用到）

## Phase C: View（两阶段）

- [ ] **C.1** `lib/engine/view.ts`：拆 `buildView` 为 `buildDecisionView(state, agent_id)` 与 `buildResponseView(state, agent_id, inbox_for_this_round)`
- [ ] **C.2** 两个 view 都填 `public_pledges`（从 state，过滤出 due_round > state.round 的活跃承诺）、`pending_pledges`（filter `from===agent_id && due_round===state.round`）、`recent_defections`（state 完整列表）
- [ ] **C.3** `DecisionView.inbox` 永远 `[]`；`ResponseView.inbox` 是本回合 decision 阶段路由进来的 request
- [ ] **C.4** view 内**严禁**包含任何 agent 的 `inner_thought`；写 inline 注释 + 单测保证

## Phase D: Settlement 重构（核心）

- [ ] **D.1** `lib/engine/settle.ts`：把 `settleRound` 改造为两步：
  - `routeRequests(state, decisionActions) → { inboxes_this_round }`（同步消费，不再 nextInboxes）
  - `settleResponses(state', responseActions, decisionPledges) → SettleResult`
- [ ] **D.2** `settleResponses` 内：① 把所有新 pledge（decision + response）加入 state.public_pledges，设 due_round=current+1；② 找 pending pledges（due_round=current）；③ 算 actual transfer per (from,to) 累加；④ 对每条 pending 标 kept/defected，收集 defectors set；⑤ 查表算 bonus，apply 到每个 defector 的 energy；⑥ 若 keep_promise_bonus>0，每条 kept pledge 给 to 加 bonus；⑦ 清除 pending；⑧ 走原 settle 流程（pressure, eliminate）
- [ ] **D.3** `lib/engine/round.ts`：`runRound` 重写为两阶段：
  - 并行 decision_phase LLM call → emit `agent_decision_phase` events
  - routeRequests
  - 并行 response_phase LLM call（带本回合 inbox 的 view）→ emit `agent_response_phase` events
  - settleResponses
  - emit `round_settled`（含 pledges_made / pledges_settled 新字段）
- [ ] **D.4** `runSimulation` 顶层不变（初始化 state 时把 `public_pledges: []`, `recent_defections: []` 加进去）

## Phase E: Agent runtime 与 stub

- [ ] **E.1** `lib/agents/stub-agent.ts`：增加 `decide_phase(view: DecisionView)` 与 `respond_phase(view: ResponseView)` 两个方法；老的 `decide` 标 deprecated
- [ ] **E.2** `lib/agents/llm-agent.ts`：同样拆两个方法，复用一个 `_call(view, phaseName, parser)` helper；每个 phase 调一次 LLM
- [ ] **E.3** `AgentRuntime` 类型从 `{ decide }` 改成 `{ decide_phase, respond_phase }`
- [ ] **E.4** 失败模式：phase 失败 → 该 agent 该 phase 视为「parsed:null」；engine 把它当成空 action（无 request / 无 allocation / 无 pledge / inner_thought=""）

## Phase F: Prompt 模板

- [ ] **F.1** `lib/agents/prompt-template.ts`：拆 `buildPrompt(view)` 为 `buildDecisionPrompt(view: DecisionView, shared)` 与 `buildResponsePrompt(view: ResponseView, shared)`
- [ ] **F.2** 两个 prompt 都渲染 public_pledges / pending_pledges / recent_defections 三个 ledger block
- [ ] **F.3** 决策 prompt JSON schema 说明改为 `{requests, pledges, inner_thought}`；响应 prompt 改为 `{allocations, pledges, inner_thought}`
- [ ] **F.4** `DEFAULT_SHARED_SYSTEM_PROMPT` 注入「承诺与背叛红利」机制段（仿 Python `SYSTEM_PROMPT_TEMPLATE` 第 33-110 行的中文版，简化到 ≤500 字）；保留现有「说话风格」段落

## Phase G: Event stream / 注册表

- [ ] **G.1** `lib/registry.ts`：emit 处理新事件类型；JSONL append 不变（每事件一行）
- [ ] **G.2** `app/api/events/[sim_id]/route.ts`：SSE 转发不变（事件 union 已扩展）
- [ ] **G.3** `lib/stats/aggregate.ts`：更新统计——支持新事件类型；保留对老 `agent_decision` 的兼容
- [ ] **G.4** `tests/stats.test.ts`：补两阶段事件的 aggregate case

## Phase H: UI

- [ ] **H.1** `components/ChatBubbles.tsx`：识别 `agent_decision_phase` / `agent_response_phase` 两种事件；pledge 在 bubble 内用 chip 渲染（紫色 ◆ 图标）；继续兼容老 `agent_decision` 事件（按 parsed.action 老逻辑渲染）
- [ ] **H.2** `components/RoundSettleCard.tsx`：新增「本回合承诺结算」段——列出每条 pledges_settled_this_round 条目，kept 绿色、defected 红色 + bonus_paid；新增「本回合新承诺」一行 chips；老事件无此字段时整段隐藏
- [ ] **H.3** `components/PublicPledgesPanel.tsx`（新）：侧栏组件，实时显示当前公开承诺，按 due_round / from 排序
- [ ] **H.4** `components/DefectionLedger.tsx`（新）：侧栏组件，最新背叛在上
- [ ] **H.5** `components/ConfigPanel.tsx`：加「承诺与背叛」折叠面板——`enabled` checkbox、4 个红利数字输入（1/2/3/4+ 人）、`keep_promise_bonus` 数字输入
- [ ] **H.6** `components/Arena.tsx`：把 PublicPledgesPanel + DefectionLedger 放进右侧栏（保持现有 EnergyChart / TokenMeter / FinalStandings 的布局）
- [ ] **H.7** Inner thought toggle：Arena header 加「研究者视角」开关；打开时 ChatBubbles 在每个 bubble 旁渲染 `parsed.inner_thought`（灰底斜体）
- [ ] **H.8** `components/TokenMeter.tsx`：拆 decision / response 两栏（或合并显示但分计）

## Phase I: 测试

- [ ] **I.1** `tests/parse.test.ts`：Phase B 的所有 case（self-pledge、dead-target、quota 截断、缺 inner_thought 补默认、markdown fence 剥离）
- [ ] **I.2** `tests/engine.test.ts`：D7 测试矩阵的所有 settle/bonus case（11 个核心 case）
- [ ] **I.3** `tests/view.test.ts`：DecisionView/ResponseView 字段、pledge ledger 进 view、inner_thought 隔离
- [ ] **I.4** `tests/registry.test.ts`：两阶段事件时序、新 round_settled 字段
- [ ] **I.5** `tests/stats.test.ts`：兼容旧 + 新事件的 aggregate
- [ ] **I.6** 删除所有旧测试中使用 `decide` / `AgentAction` 单 union 的代码或迁移到新签名

## Phase J: 质量门 + 集成 smoke + 归档

- [ ] **J.1** `pnpm lint` 零警告
- [ ] **J.2** `pnpm typecheck` 通过
- [ ] **J.3** `pnpm test` 全绿（预期 ≥95 个）
- [ ] **J.4** `pnpm dev` 起，跑一局 3 agent stub + max_rounds=5，浏览器确认：
  - 每回合看到 decision bubble + response bubble
  - pledge chip 渲染正常
  - settle card 显示 pledges_settled 与 pledges_made
  - public pledges / defection ledger 实时更新
  - 研究者视角 toggle 切换 inner_thought 显示
- [ ] **J.5** 起一局真实 LLM（如 doubao）2 agent，max_rounds=3，确认 prompt 注入正确（terminal log 抓一次 raw response 看格式）
- [ ] **J.6** 合 4 份 spec delta 到 `openspec/specs/`
- [ ] **J.7** 移 change 到 `openspec/changes/archive/2026-05-26-add-pledge-betrayal/`
- [ ] **J.8** `openspec/project.md` Decision Log 加一行
