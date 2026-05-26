# Proposal: add-pledge-betrayal

## Why

研究项目 `no-food-for-you` 的 `cn_llm_benchmark/agent.py` 里有一套 **pledge（承诺）+ 守约/背叛红利**机制，是这套零和博弈最有意思的部分——光靠 request/respond 的「索要-给予」太平淡，agent 很容易陷入老好人或互相不理两种死板均衡。承诺机制把博弈推向真正的囚徒困境：

- **公开承诺**：agent 公开宣布「下回合给 X 点能量给 Y」，承诺立刻对所有人可见
- **守约/背叛分叉**：到期回合的响应阶段，引擎对照实际分配判定守约还是背叛
- **背叛红利按背叛人数递减**（独狼 +3 / 2 人 +1 / 3 人 0 / 4 人及以上 -2）—— 制造「想叛但怕大家都叛」的策略张力
- **永久公开的 defection ledger**：每次背叛进入历史，影响后续回合的信任

本提案把上述机制移植到当前 Web 端 game 项目，但**做两个关键取舍**：

1. **两阶段重构**：把每回合的「一次 LLM 调用」拆成 decision + response 两阶段，对齐 Python 版的语义。token 成本翻倍是已知代价 —— 用户明确选了对齐 Python 版。
2. **守约奖励默认关闭**：Python 版守约 → 接收方 +1 系统能量（正和），引入「凭空创能」会让零和压力打折，我们默认 0，留在 config 里。

## What Changes

### `simulation-engine` MODIFIED + ADDED

**MODIFIED**
- `Requirement: Round-based State Machine` — phase 列表从 5 阶段（state broadcast → decision → aggregation → response → settlement）改成 7 阶段（state broadcast → **decision phase LLM call** → request aggregation → **response phase state broadcast** → **response phase LLM call** → pledge settlement → settlement）。移除 "MVP simplification: 合并 decision 与 response 为一次 LLM 调用" 这条 informative note。
- `Requirement: Round Settlement Emits Reconcilable Detail` — `round_settled` 新增字段 `pledges_made_this_round`、`pledges_settled_this_round`（含 kept/defected 标记 + bonus_paid）。

**ADDED**
- `Requirement: Pledge Lifecycle` — pledge 的状态机：created（决策或响应阶段发出，立刻 public）→ pending（下回合到期）→ kept 或 defected（响应阶段结算）。
- `Requirement: Defection Detection at Pledge Maturity` — 在响应阶段结算 pending pledge：实际分配 ≥ 承诺额 → kept；实际分配 < 承诺额 → defected。
- `Requirement: Betrayal Bonus Payout` — 按本回合 defector 总数从 `betrayal_bonus_table` 查表，给每个 defector 加（可能为负的）能量。
- `Requirement: Keep-Promise Bonus (default off)` — 若 `keep_promise_bonus > 0`，每个守约 pledge 的接收方在响应阶段结算时获得该数额的系统能量。
- `Requirement: Public Pledge Ledger and Defection Ledger` — 引擎维护 `public_pledges` 与 `recent_defections` 两个 ledger，写入 next view。

### `agent-config` MODIFIED + ADDED

**MODIFIED**
- `Requirement: GameConfig Schema` — 新增字段 `pledges: PledgesConfig`（含 `enabled: boolean`、`betrayal_bonus_table: number[]`、`keep_promise_bonus: number`）。
- `Requirement: JSON-only Response Contract` — 替换为「两阶段动作契约」。Decision phase 返回 `{requests, pledges, inner_thought}`；Response phase 返回 `{allocations, pledges, inner_thought}`。旧的单动作 union（request/respond/noop）废弃。
- `Requirement: Prompt Template Structure` — per-round 状态块新增 `public_pledges` / `pending_pledges` / `recent_defections` 段；prompt 按 phase 分两套模板。

**ADDED**
- `Requirement: Pledge Type` — Pledge 的字段约束（`to`、`amount: positive integer`、引擎注入的 `from`、`round_made`、`due_round`）；自承诺、对已淘汰 agent 的承诺 → 引擎丢弃。
- `Requirement: Inner Thought Field` — 决策与响应输出都接受 `inner_thought: string`（可空）；该字段**永远不会**出现在任何 agent 的 view / inbox / history 里，只落到 JSONL 和事件流。
- `Requirement: Per-Round Pledge Quota` — 单回合（每阶段）最多 3 条 pledge；超出截断 + `policy_truncated` 标记。

### `event-stream` MODIFIED + ADDED

**MODIFIED**
- `Requirement: Event Type Enumeration` — 把 `agent_decision` 拆成 `agent_decision_phase` 和 `agent_response_phase` 两种事件，每 agent 每回合最多各发一次。其他事件类型不变。
- `Requirement: Round Settlement Emits Reconcilable Detail`（在 event-stream 一侧的镜像）— `round_settled.pledges_made_this_round` 与 `pledges_settled_this_round` 同步加入字段说明。

**ADDED**
- `Requirement: Pledge Event Persistence` — `round_settled.pledges_settled_this_round[i]` 每条须含 `from, to, pledged, actual, status: "kept" | "defected", bonus_paid`。

### `arena-ui` MODIFIED + ADDED

**MODIFIED**
- `Requirement: Chat Bubble Timeline` — 决策/响应分别渲染。Pledge 作为 bubble 内的 chip 附加渲染（pledge chip 用专属颜色）。
- `Requirement: Round Settle Card` — 卡片新增「本回合承诺结算」一段：列出每条到期 pledge 的 from→to / pledged / actual / kept 或 defected 标记 / bonus_paid。
- `Requirement: Game Parameter Form` — 加 `pledges` 折叠面板：开关 + 红利表（4 个数字，分别对应 1/2/3/4+ defectors）+ keep_promise_bonus。

**ADDED**
- `Requirement: Public Pledge Ledger Panel` — Arena 侧栏一直显示当前 `public_pledges`（按到期回合排序）。
- `Requirement: Defection Ledger Panel` — 显示历史 `recent_defections`（最新在上），每条带 round / from / to / pledged / actual。
- `Requirement: Inner Thought Researcher Toggle` — 默认不展示 inner_thought；右上角加「研究者视角」toggle，打开后在每个 bubble 旁渲染对应 agent 的 inner_thought 灰底卡片。

## Scope

### In
- 把 decision/response 两阶段彻底引入 engine + event-stream + UI
- Pledge 类型、ledger（public + defection）、pending_pledges、`inner_thought` 全栈贯通
- 背叛红利按 config 表算（默认 [+3, +1, 0, -2]，4 人以上回退到表的最后一项）
- 守约奖励默认 0、可调
- 默认 prompt 注入承诺/背叛章节（仿 `agent.py` 中 SYSTEM_PROMPT_TEMPLATE 第 33-110 行的中文版）
- 新增 UI：pledge chip、debt 提示、settlement 卡新增段、ledger 侧栏、inner_thought toggle
- Config 校验 + Zod schema + 默认值
- 完整单测：parse、settle（守约/背叛 4 case：1/2/3/4 人）、bonus 表查表边界、self-pledge / dead-target 过滤、quota 截断、ledger 推进

### Out
- ❌ 角色（traitor/villager）+ oracle 调查机制（Python 版有 `self_role` / `revealed_roles` / `investigations`，本提案不涉及）
- ❌ 历史摘要器（LlmHistorySummarizer）—— 当前 game 项目 history 直接全量喂，不做摘要
- ❌ Pledge 撤销 / 修改（一旦发出不可撤销，简化状态机）
- ❌ 多到期回合（默认所有 pledge 「下回合到期」，不支持「N 回合后到期」）
- ❌ 部分守约（actual 在 [1, pledged-1] 之间）也算 defected，不做「程度」区分

### Coordination with other in-flight changes
- 与 [[remove-info-mode]] 并行：两份都改 `GameConfig` 与 `simulation-engine`、`arena-ui` spec。本提案**不**触碰 info_mode 相关 spec 段落；先合 remove-info-mode 再 rebase 本提案最安全。

## Risks

| 风险 | 缓解 |
|---|---|
| LLM 调用翻倍 → token 成本翻倍、单回合延迟翻倍 | 用户已确认接受；UI 上把 token meter 拆成 decision / response 两栏让成本可见。max_rounds 默认 30 不变。|
| 两阶段引入更多失败模式（response phase API 失败时已收 inbox 但没分配） | 沿用 parse 失败 = no-op：response phase 失败 → 视为该 agent 本回合无任何 allocation，pending_pledge 全部判 defected。明示在 spec scenario 里。|
| 背叛红利表对小局（2 人）/ 大局（10 人）失衡 | 默认值就是 Python 4 人调的，本提案不假装通用；config 暴露给用户调；spec 不规定「正确」红利曲线。|
| Pledge 数据结构污染 history、view 里大量重复字段 | view 里只放 `public_pledges` / `pending_pledges` / `recent_defections` 三个 ledger，不把每条 pledge 也塞进 HistoryEntry.events；ledger 直接用于 prompt 渲染。|
| Inner thought 泄漏到其他 agent（破坏「私密」契约） | engine 在 buildView 时白名单字段；单测覆盖「inner_thought 不进 view、不进 history、不进 inbox」。 |
| 老 JSONL replay 时没有新字段（pledges_*、agent_decision_phase） | UI 的 settle card / ledger 在字段缺失时优雅降级（隐藏对应段落，不报错）；老 `agent_decision` 事件类型保留为可识别但 deprecated（UI 仍能渲染）。|
| 两阶段重写 + 移植中文提示文本是大改动，单 PR 难审 | tasks.md 分 7 个 phase 推进；每 phase 单独跑质量门；types/schema 先合、settle 再合、prompt/UI 最后合。|
