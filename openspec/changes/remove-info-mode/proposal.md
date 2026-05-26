# Proposal: remove-info-mode

## Why

`info_mode` 当初是想做"能看到多少历史"的研究旋钮——Open / Blind / Partial(K)。但跑了几局后发现：

1. **没人会去调它**。日常游玩用户没动机切到 Blind/Partial，研究者真要做对照实验也不会通过点 UI 切；都直接改 default。
2. **它增加了 3 处真实复杂度**：`InformationMode` 类型 + Zod 判别联合、`view.ts::filterHistory` 整个分支函数、ConfigPanel 一组条件渲染的 radio。删掉等于少一条决策路径。
3. **没意义的"模式"会误导 prompt 工程**。当前默认 `partial k=3` 让 agent 看到的历史窗口随回合滑动，agent 的"记忆"行为不稳定，调 prompt 时常常分不清是模型问题还是窗口问题。

干净的默认行为：**永远把完整历史喂给 agent**（等价旧 Open 模式）。研究对照实验如果以后真要做，再走单独的 change 加回来。

## What Changes

### `simulation-engine` MODIFIED
- 删除 `Requirement: Information Modes`（含 Open / Blind / Partial 三个 scenario）
- 修 `Requirement: Round-based State Machine` phase 1 描述：从"based on the information mode"改为单纯"build a per-agent view"
- 修 `Requirement: Reason Propagates Into Subsequent Round Views` 的 scenario：去掉 "AND info_mode allows N to be visible" 这一行（不再有此条件）

### `agent-config` MODIFIED
- 从 `GameConfig` 字段列表移除 `info_mode: InformationMode`
- 修 `Requirement: Prompt Template Structure` scenario：把 "inbox (filtered by info_mode)" 改为 "inbox, full history of public events"
- 新增 legacy 容忍 scenario：旧 config POST 带 `info_mode` 字段时 Zod 透传忽略

### `arena-ui` MODIFIED
- `Requirement: Game Parameter Form` 控件列表去掉 `info_mode` 这一项

### 代码 surface area（非 spec，记在这里方便后续 tasks）
- `lib/engine/types.ts`：删 `InformationMode` 类型 + `GameConfig.info_mode` 字段 + `AgentView.history` 注释里的 "filtered by info_mode"
- `lib/config-schema.ts`：删 `InformationModeSchema` 与 schema 字段
- `lib/engine/view.ts`：删 `filterHistory`；`buildView` 里 history 直接用 `state.history`
- `components/ConfigPanel.tsx`：删 "信息模式" section、`InfoModeControl` 函数、`InformationMode` import
- `app/page.tsx`：`defaultConfig` 删 `info_mode` 字段
- `tests/view.test.ts`：删 "buildView — information modes" 整个 describe（5 个 history entry + 3 个 case 全去）
- `tests/engine.test.ts` / `tests/registry.test.ts`：cfg helper 删 `info_mode` 字段
- `lib/agents/prompt-template.ts`：**无需改**（`renderHistory` 不感知模式，view.history 永远全量后它自然 render 全历史）

## Scope

### In
- 把 info_mode 从类型、schema、UI、tests 全部清干净
- buildView 永远返回完整 history
- 已归档 change 的 spec **不动**（历史快照）

### Out
- ❌ 把 history 字段本身也删掉（agent 仍要看历史，只是不再被过滤）
- ❌ 给 history 加长度上限/截断（30 回合默认下，prompt 长度可控；真长了再说）
- ❌ 改 prompt-template 的 history 渲染格式

## Risks

| 风险 | 缓解 |
|---|---|
| 老 JSONL 的 `sim_started.config` 里带 `info_mode` 字段 | Zod 默认 strip 未知字段（schema 未启用 `.strict()`），透传 OK；replay 仅消费已落库事件，不重跑 view，不会触发 |
| 长 sim（max_rounds 拉到 100+）下完整 history 撑大每回合 prompt → token 飙升 | MVP 默认 max_rounds=30，单回合 history ~30 entries，可接受。真要长 sim 再单独提 change 加截断 |
| 与未归档的 [[simplify-config-ui]] 在 `Game Parameter Form` / `GameConfig Schema` 两个 Requirement 上重叠 | 哪个先合入就重写基线，后合的 change 在 archive 前需要 rebase delta；两份提案不冲突（删的字段不重叠），只是要按序合 |
| 用户期待"研究模式"未来回归 | 本提案不预留兼容代码；要回归时新开 change，重新定义类型即可（git 历史可参考） |
