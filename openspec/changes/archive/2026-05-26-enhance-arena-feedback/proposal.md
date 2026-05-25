# Proposal: enhance-arena-feedback

## Why
MVP 跑通后玩起来发现 3 个**叙事断层**：

1. **因果隐形**：回合 N 的 chat bubbles 显示了"A 向 B 求救"和"B 决定给 2 点"，但**实际转移多少、扣了多少维持费**完全看不到——玩家要靠 energy 折线图脑补 delta
2. **没有闭幕仪式**：游戏结束就一个小字 divider "all_eliminated"，没有任何收尾感、没有排名、没有"故事讲完了"的体感
3. **淘汰太静**：`⚰ 淘汰: X` 一行带过，缺乏戏剧性顿挫——这本应是整局最有冲击力的瞬间

把这 3 个断层修掉，才能真正"好玩"。

## What Changes

### Engine 层（小幅扩展）
- `simulation-engine` 的 `round_settled` 事件**扩展**新增 3 个字段：`transfers` / `pressure_cost` / `prev_energies`
- `event-stream` 跟着同步事件 schema

### UI 层（新增 3 个组件 + 整合）
- **新增 `RoundSettleCard`**：每个回合的 chat bubbles 末尾 + 下个回合开头之间，插入一张横向战报卡（每 agent energy delta + 压力费 + 转移箭头）
- **新增 `FinalStandings`**：sim_ended 时一张全宽收尾大卡（排名表 + 3 个奖项）
- **新增 `TombstoneCard`**：升级 `⚰ 淘汰` 那行为居中墓碑卡片
- `arena-ui` spec 增加 3 个 Requirement

## Scope

### In
- 引擎事件 schema 扩展（向后兼容老 JSONL：缺失字段时 UI 优雅降级）
- 3 个新 React 组件 + 配套 CSS
- 在 `ChatBubbles` 中插入新卡片的逻辑
- 更新引擎单测覆盖新字段
- spec deltas（`simulation-engine` MODIFIED、`event-stream` MODIFIED、`arena-ui` ADDED）

### Out
- ❌ "失约"标注（A 求救 R1 → B 在 R2 没响应 → 在 R1 的 bubble 上反向标记）：复杂，phase 3 再说
- ❌ 联盟图可视化：phase 2 的 `add-metrics`
- ❌ 音效 / 动画过场：MVP 加分项，不在此范围
- ❌ 截图分享：phase 3
- ❌ 修改 RoundLogger 或 JSONL 文件格式（向前向后兼容）

## Impact
- 修改：`simulation-engine` 和 `event-stream` 两个 spec 的 settled 事件契约（MODIFIED 一个 Requirement）
- 新增：`arena-ui` 三个 Requirement（RoundSettleCard / FinalStandings / TombstoneCard）
- 旧 JSONL：缺少新字段，UI 应优雅降级（只是显示不出 transfer 列）

## Risks
| 风险 | 缓解 |
|---|---|
| 老 JSONL replay 时新字段缺失 | UI 把缺失字段当空数组/0 处理；不抛错 |
| 卡片插入打乱阅读流 | 卡片用与 bubble 不同的视觉调性（横向 vs 纵向）做区分 |
| FinalStandings 计算口径有争议（"收到/给出"按谁的口径算） | 用 `transfers` 累加：`收到 = sum(t.amount where t.to===id)`、`给出 = sum where t.from===id`；写进 spec 不留模糊 |
