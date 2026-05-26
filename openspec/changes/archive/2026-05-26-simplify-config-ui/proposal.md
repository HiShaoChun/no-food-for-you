# Proposal: simplify-config-ui

## Why
跑了几局发现 Config Panel 上有两个**没意义的旋钮**：

1. **每回合最多请求数 (max_requests_per_round)** —— 字段进了 GameConfig / Zod schema，但 engine 从未读它。是个**死字段**，不仅占 UI 空间，还让用户以为它会生效。
2. **种子 (master_seed)** —— 调试时有用，日常游玩用户不会去想"我该填几"。每次手点 🎲 才能洗牌，体验拧巴；而且 seed 已经在 sim_started 事件里持久化了，要复现也能从 JSONL 里捞。

两者都是 UI noise。

## What Changes

### `agent-config` MODIFIED
- 从 `GameConfig` 类型彻底移除 `max_requests_per_round`
- 从 Zod schema 移除对应字段
- 默认 `master_seed` 改为每次启动随机（`Math.floor(Math.random() * 1e9)`），而不是写死 42

### `arena-ui` MODIFIED
- Config Panel **不再渲染** "每回合最多请求数" 输入
- Config Panel **不再渲染** master_seed 输入与 🎲 按钮
- 用户每次点 Start，前端在 POST 前用新的随机 seed 替换 config.master_seed
- seed 仍在 sim_started 事件 / JSONL 里可见（复现路径不变）

## Scope

### In
- 移除 1 个字段（max_requests_per_round）
- 隐藏 1 个 UI 控件（seed），但保留底层 seed 概念
- 更新单测里 cfg 构造函数（移除字段）
- 更新已归档 change 的 spec **不动**——它们是历史快照

### Out
- ❌ 把 seed 从 GameConfig 类型里删掉（引擎需要它做确定性 RNG，必须保留）
- ❌ 把 seed 从 sim_started 事件里隐藏（用户想复现旧局还得有路径）
- ❌ 给"复现旧 seed"加专门 UI——下次再说

## Risks
| 风险 | 缓解 |
|---|---|
| 老 JSONL replay 会带 max_requests_per_round 字段 | 字段被忽略即可；TS 不报错（field is gone but old JSON has extra keys, Zod `.strict()` 不开则忽略） |
| 用户想复现某一局 | seed 仍在 sim_started 事件 / `runs/*.jsonl` 第一行可读 |
| 测试里 cfg helper 多处写了 `max_requests_per_round: 1` | 全部清掉 |
