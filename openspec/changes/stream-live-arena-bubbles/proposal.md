# stream-live-arena-bubbles

## Why

当前 Arena 看上去"不实时"——用户点 Start 之后要等几秒钟才**整批**冒出所有 agent 的气泡，不像群聊。

根因不在 SSE 通道（`/api/events/<sim_id>` 是逐条推的），而在引擎层：
- `lib/engine/round.ts` 的 `runRound()` 对 decision / response 两个 phase 都用 `Promise.all(living.map(...))` 等所有 agent **全部返回**才往外 `emit`；
- `runSimulation()` 把整批 `decision_events`、再整批 `response_events`、最后才发 `round_settled`，用 `for...emit` 循环依次写出。

后果：一个 phase 内任何一个 LLM 慢，所有 agent 的气泡都被那个慢的拖到一起出现。在用户体验上就是"刷一下出来三条"。

本提案把每个 agent 的事件做成**完成即 emit**，并新增"开始思考"占位事件，配合 UI 改造把 Arena 中央那栏改造成**真正的实时群聊**观感。

⚠️ **不向后兼容**：用户明示项目仍在开发中，本提案直接删掉 legacy `agent_decision` / `LegacyAgentDecisionEvent` / `LegacyDecisionBubble`，不再保留旧 JSONL 渲染路径。`runs/` 下旧 JSONL 重放只承诺当前 schema。

## What Changes

### `simulation-engine` MODIFIED

- `Requirement: Round-based State Machine`
  - 第 2 步「Decision LLM call」与第 5 步「Response LLM call」的并发语义保持不变（仍可 `Promise.all` 并发发起），**但事件 emit 时点改成「每个 agent 的 LLM call 完成即立刻 emit」**，而不是等整个 phase 收齐再批量 emit。
  - 在第 2 / 第 5 步**开始时**，引擎 SHALL 对每个 living agent 各 emit 一条对应的 `agent_decision_started` / `agent_response_started` 事件（在 LLM call 派发之前发出，便于 UI 立即渲染占位气泡）。
  - 第 3 步「Request aggregation」、第 4 步「Response state broadcast」与第 6 / 7 步的串行语义保持不变（必须等同 phase 所有 agent 落定才能进入下一 phase）。

### `event-stream` MODIFIED + ADDED + REMOVED

**MODIFIED**
- `Requirement: Event Type Enumeration` — 事件种类从 6 种调整为 8 种：新增 `agent_decision_started` 与 `agent_response_started`；**删除** legacy `agent_decision` 类型（不再保留兼容）。事件顺序约束写明：每个 `agent_decision_started` SHALL 在对应 `agent_decision_phase` 之前；response 同理。

**ADDED**
- `Requirement: Per-agent Phase Start Event` — 定义 `agent_decision_started` / `agent_response_started` 两类事件的字段（`round`、`agent`、`phase`、`t`），保证 UI 能立刻渲染占位气泡。
- `Requirement: Per-agent Emission Timing` — 每个 phase 内 agent 间 emit 顺序 SHALL 反映 LLM call 的实际完成顺序，不再受 agent 在 config 中位置的影响；先完成的先 emit。`round_settled` 仍在该 phase 所有 agent emit 之后才发出。

**REMOVED**
- `Requirement: Inner Thought Persistence` 中关于 legacy `agent_decision.raw` 的 Scenario（重命名 / 合并到现有 `agent_decision_phase` / `agent_response_phase` 路径）—— 通过 MODIFIED 完整重写整个 Requirement 实现，无单独 REMOVED 名目。

### `arena-ui` MODIFIED + ADDED

**MODIFIED**
- `Requirement: Chat Bubble Timeline` — 移除 legacy `agent_decision` 渲染场景；明确"气泡按 SSE 到达顺序追加"而不是按 agent 配置顺序排列；说明 `agent_decision_started` / `agent_response_started` 会插入一个占位气泡，等对应的 `_phase` 事件到达时**就地**替换为完整气泡（同 key，避免视觉跳动）。
- `Requirement: Token Meter Split by Phase` — 移除 legacy `agent_decision` 累加场景（仅留 decision / response 两条计数路径）。

**ADDED**
- `Requirement: Thinking Placeholder Bubble` — 收到 `agent_*_started` 事件时，UI SHALL 立即渲染一个该 agent 颜色的占位气泡，内含「正在思考」动画与 phase chip；对应 `agent_*_phase` 事件到达时 SHALL 原地替换为完整气泡。若 `_started` 已收到但 `_phase` 长时间未到（默认 60s），占位气泡 SHALL 转为"超时"状态并不再阻塞布局。
- `Requirement: Agent Mention Chip` — 气泡正文中所有 `→ <agent>` 目标 SHALL 渲染为可识别的 `@芯片`（彩点 + display_name），hover 时 SHALL 高亮该 agent 在 EnergyChart 与配置面板里对应的行/线。
- `Requirement: Sticky Scroll With New-Message Indicator` — 气泡列表默认贴底滚动；当用户向上滚出底部一定距离（≥ 64px）后，自动滚动 SHALL 暂停；底部 SHALL 显示「N 条新消息 ↓」浮标，点击后回到底部并恢复自动滚动。

### `agent-config` 不动
两阶段动作契约（`DecisionAction` / `ResponseAction`）、`inner_thought`、`Pledge` 类型、prompt 模板 —— 都不变。

## Scope

### In
- `lib/engine/round.ts` 改写 emit 时点：从「Promise.all → 批量 emit」改成「每个 agent promise 自己 await 自己 emit」；phase 开始时先广播一批 `_started` 事件。
- `lib/engine/types.ts` 新增 `AgentDecisionStartedEvent` / `AgentResponseStartedEvent`；删除 `LegacyAgentDecisionEvent` / `LegacyRequestAction` / `LegacyRespondAction` / `LegacyNoopAction` / `AgentAction`（legacy union）。
- `app/page.tsx` 的 `dedupeKey` 处理新增事件（按 `type:round:agent` 去重）。
- `components/ChatBubbles.tsx` 大改：按事件到达顺序累积气泡，识别 `_started` → 占位 → `_phase` → 替换；同时移除 `LegacyDecisionBubble`。
- 新增 `AgentMentionChip` 子组件；现有目标渲染统一走这条路径。
- 新增滚动锁定 hook（`useStickyScroll`）+ 浮标按钮。
- `components/TokenMeter.tsx` 删掉 legacy `agent_decision` 分支。
- 单测：engine 的并发 emit 顺序（先完成的先 emit）、`_started` 必先于 `_phase`、phase 间串行约束未破坏。

### Out
- ❌ LLM 真·token 流式（拆 streaming SDK / partial JSON 处理）—— 留给后续 change，本次只到「完成即 emit」粒度。
- ❌ JSONL replay viewer 单独改造——目前 SSE 路径里 backlog 已是逐条 send，只要新事件 schema 一致即可。
- ❌ 多人观战、房间共享 —— 与本次无关。
- ❌ 气泡的虚拟滚动 / 列表性能优化 —— 30 轮 × ~3 agent × 2 phase ≈ 180 条远未到性能边界。

## Risks

| 风险 | 缓解 |
|---|---|
| `agent_*_started` 与 `agent_*_phase` 之间网络/写盘乱序导致 UI 看到"phase 早于 started" | `_started` 走同一 `emitEvent` 写入链（`writeChain`），保证 JSONL 顺序；SSE fanout 在同一 emitEvent 调用内的循环里完成。spec scenario 显式约束。|
| 占位气泡迟迟不被替换（LLM 卡住）→ 视觉上一直转圈 | 60s 软超时切换到"超时"态；spec 规定占位不阻塞后续气泡布局。|
| 气泡按到达顺序排会让相同 round 的 decision / response 交错变乱 | 同 phase 内交错是预期（这就是群聊感）；phase 间仍严格串行——`agent_decision_phase` 全部走完才会出现任何 `agent_response_started`，这一点在 simulation-engine spec 第 2/5 步串行约束里已经保证，spec scenario 显式重申。|
| 删除 legacy `agent_decision` 会让 `runs/` 下旧 JSONL 重放失败 | 用户明示开发中不考虑兼容；旧文件最多渲染缺失，不崩溃由 `parsed === null` 路径兜底。|
| dedupeKey 漏掉新事件 → 重连后占位气泡重复 | `dedupeKey` 同步扩到 8 种事件类型；单测覆盖重连重放路径不重复渲染占位。|

## 验收

1. `pnpm lint` / `pnpm typecheck` / `pnpm test` 三道质量门全绿（预期单测从 81 → ≥ 84）。
2. `pnpm build` production 构建成功。
3. 在真实 3 agent 配置下点 Start：第一个返回的 agent 的气泡 SHOULD 在 1 秒内出现（不需等其他 agent），其他 agent 此时显示占位"正在思考"；最慢 agent 返回后其占位被原地替换。
4. 在 ChatBubbles 中悬停任意 `@芯片`，对应 agent 在 EnergyChart 与左侧 AgentPicker 行内 SHOULD 同步高亮。
5. 手动向上滚出底部 64px 后底部 SHOULD 出现「N 条新消息 ↓」浮标，点击后恢复贴底自动滚。
