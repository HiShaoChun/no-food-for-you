# Tasks: enhance-arena-feedback

## Phase A: Engine（向 round_settled 加 3 个字段）
- [ ] **A.1** `lib/engine/types.ts`：扩展 `SimEvent.round_settled` 加 `prev_energies` / `transfers` / `pressure_cost`
- [ ] **A.2** `lib/engine/settle.ts`：让 `settleRound` 返回 `transfers` 数组（从 `eventsThisRound` 提取 kind="transfer"）+ 入口快照 prev_energies
- [ ] **A.3** `lib/engine/round.ts`：在 emit `round_settled` 时填新字段
- [ ] **A.4** 单测：`tests/engine.test.ts` 加用例校验新字段
- [ ] **A.5** 单测：`tests/registry.test.ts` 集成测试加断言

## Phase B: UI 组件
- [ ] **B.1** `components/RoundSettleCard.tsx`：横向卡，agent 网格 + transfer 行 + 压力角标
- [ ] **B.2** `components/TombstoneCard.tsx`：居中墓碑卡
- [ ] **B.3** `components/FinalStandings.tsx`：闭幕大卡 + 排序表 + 奖项徽章
- [ ] **B.4** CSS：`app/globals.css` 加 `.settle-card`、`.tombstone`、`.final-standings`

## Phase C: 整合
- [ ] **C.1** `components/ChatBubbles.tsx`：在每个 `round_settled` 事件位置插入 `RoundSettleCard`；在淘汰位置用 `TombstoneCard` 替换原 `.settle-event`；在 `sim_ended` 位置插入 `FinalStandings`
- [ ] **C.2** 抽出共享工具：`lib/stats/aggregate.ts` 给 FinalStandings 用（含旧 JSONL 兼容路径）
- [ ] **C.3** 单测：`tests/stats.test.ts` 校验聚合口径

## Phase D: 质量门
- [ ] **D.1** `pnpm typecheck` 全绿
- [ ] **D.2** `pnpm lint` 全绿
- [ ] **D.3** `pnpm test` 全绿（含新增 stats 测试）
- [ ] **D.4** `pnpm build` 成功

## Phase E: 归档
- [ ] **E.1** 把 `openspec/changes/enhance-arena-feedback/specs/*/spec.md` 的 delta 合入 `openspec/specs/<capability>/spec.md`
- [ ] **E.2** 把 change 移动到 `openspec/changes/archive/2026-05-26-enhance-arena-feedback/`
- [ ] **E.3** 在 `openspec/project.md` 的 Decision Log 追加一行
