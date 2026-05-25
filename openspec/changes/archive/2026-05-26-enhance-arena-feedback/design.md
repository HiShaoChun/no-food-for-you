# Design: enhance-arena-feedback

## D1. round_settled 事件扩展

### 新的 schema
```ts
type SimEvent =
  | ...
  | {
      type: "round_settled";
      sim_id: string;
      round: number;
      energies: Record<string, number>;          // 现存（结算后）
      prev_energies: Record<string, number>;     // 新增：结算前
      eliminated: string[];
      transfers: Array<{ from: string; to: string; amount: number }>;   // 新增
      pressure_cost: number;                     // 新增：本回合维持费
      t: string;
    }
```

### 为什么把 transfers 放进 settled 事件而不是单独事件
- 已经按回合分组，所有转移天然属于这个回合
- 一次事件就能让 UI 完整渲染 settle card（少一次 React 重渲染）
- JSONL 文件每行依然是独立事件，无破坏

### 为什么加 prev_energies 而不是让前端算
- 前端要从 round_started 或上一个 round_settled 拼接才能算，容易出错
- 多 1 条 Record 字段对 JSONL 大小影响微乎其微
- replay 时一目了然

## D2. 引擎实现位置

`lib/engine/settle.ts` 的 `settleRound` 已经在内部维护：
- `eventsThisRound: HistoryEvent[]` 包含所有 `kind: "transfer"` 的事件
- 知道 `state.energies` 是结算前的（在函数入口快照即可）
- 通过 `pressureCost(state.config.pressure, state.round)` 算出本回合压力

把这 3 个值返回到 `RoundOutput`，然后在 `round.ts` 的 `runSimulation` 主循环里 emit 时塞进 settled 事件。

## D3. UI 组件结构

```
ChatBubbles (容器)
├── RoundDivider           Round 1
├── Bubble (decision)      A1 → A2: request
├── Bubble (decision)      A3 → A2: request
├── Bubble (decision)      A2: noop
├── RoundSettleCard ⭐     [新增] 回合 1 结算
│
├── RoundDivider           Round 2
├── Bubble (decision)      ...
├── TombstoneCard ⭐       [新增] 💀 A1 淘汰
├── RoundSettleCard ⭐     回合 2 结算
│
└── FinalStandings ⭐      [新增] 🏁 游戏结束 + 排名 + 奖项
```

## D4. RoundSettleCard 视觉规格

横向布局，浅色卡片，玻璃感边框：

```
┌─ ROUND 2 · SETTLED ──────────────────────────  压力 -1 ─┐
│ ● A1 9→8 (-1)   ● A2 9→10 (+1↑)   ● A3 9→8 (-1)   ...  │
├──────────────────────────────────────────────────────── │
│ 转移：  A4 → A2  2点                                     │
└────────────────────────────────────────────────────────┘
```

- 顶行：每个 agent 一格，色点 + ID + `prev→curr (delta)`，delta 染色（正绿 / 负灰 / 零无色）
- 底行：所有 transfer 一行平铺，没有转移时**整行省略**

CSS class：`.settle-card`、`.settle-card .row`、`.settle-card .agent-cell`、`.settle-card .transfers`。

## D5. TombstoneCard 视觉规格

居中、缩窄（不占满）、墓碑灰边、emoji 💀：

```
        ┌────────────────────────┐
        │ 💀                     │
        │ doubao-seed-code #1   │
        │ 存活 3 回合 · 给出 2 │
        └────────────────────────┘
```

- 用色点匹配 agent 颜色
- 上下留 margin，与周围卡片错开

CSS class：`.tombstone`、`.tombstone .body`。

## D6. FinalStandings 视觉规格

全宽、强调闭幕：

```
╔═════════════════════════════════════════════════════════════════╗
║ 🏁 GAME OVER                                                    ║
║ all_eliminated · 持续 5 回合 · 总 token 23,673                  ║
╟─────────────────────────────────────────────────────────────────╢
║ #  Agent                生存  给出  收到  请求  响应             ║
║ ── ─────────────────── ──── ──── ──── ──── ────                 ║
║ 1  ● doubao-seed-code #2  5    1    2    3    1                 ║
║ 2  ● doubao-seed-code #5  5    0    1    2    0                 ║
║ 3    doubao-seed-code #4  4    2    0    3    1                 ║
║ ⚰  doubao-seed-code #3  3    0    0    2    0                 ║
║ ⚰  doubao-seed-code #1  3    1    1    1    1                 ║
╟─────────────────────────────────────────────────────────────────╢
║ 🏅 最慷慨: #4 (转出 2)   💸 最依赖: #3 (3 次请求)               ║
╚═════════════════════════════════════════════════════════════════╝
```

排名规则：
- 幸存优先（生存到结束的最前）
- 同生存回合按结算结束时的 energy 降序
- 都淘汰则按淘汰回合降序（越晚淘汰排越前）

**奖项口径**：
- 最慷慨 = 累计 `转出 amount` 最多者；并列时按 ID 升序
- 最依赖 = 累计发出 `request` 次数最多者
- 长寿王 = 生存回合最多者（若全淘汰则取淘汰回合最大者）；不展示如果只有 1 个幸存者很显然

## D7. 派生统计的口径（写进 spec 不模糊）
所有数据从前端已经累积的 `events: SimEvent[]` 计算，**不**让后端预算：

```ts
function computeStats(events: SimEvent[]) {
  const stats = new Map<string, { given: number; received: number; requests: number; responses: number; alive_rounds: number; eliminated_at: number | null }>();
  // ... 遍历 agent_decision (request/respond) 和 round_settled (transfers/eliminated) 累加
}
```

**transfers 是 ground truth**（policy 已经做完截断），不能用 agent 自己说要给多少（那是想给的，不是真给的）。

## D8. 与 prev_energies 的兼容性
旧 JSONL（在本 change 之前生成的）没有 `prev_energies` / `transfers` / `pressure_cost`：
- `RoundSettleCard` 检测 undefined 时退化为只显示 `energies`（无 delta、无 transfers）
- `FinalStandings` 检测 undefined 时给出折中：转出/收到 用 `respond.allocations` 累加（不精确但能跑）

## D9. 不在本 change 做的
- "失约" 反向标注：复杂、需要回头改已渲染的 bubble，留 phase 3
- 联盟图：归 `add-metrics`
- 音效 / 动画：UI polish，不是 spec 行为
- 截图导出：将来 `add-replay-export`
