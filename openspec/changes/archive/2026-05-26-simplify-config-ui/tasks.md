# Tasks: simplify-config-ui

## Phase A: 移除 max_requests_per_round
- [ ] **A.1** `lib/engine/types.ts`：从 `GameConfig` 删除 `max_requests_per_round`
- [ ] **A.2** `lib/config-schema.ts`：从 Zod schema 删除字段
- [ ] **A.3** `components/ConfigPanel.tsx`：删除对应输入控件
- [ ] **A.4** `app/page.tsx`：从 `defaultConfig` 删除该字段
- [ ] **A.5** 所有 `tests/*.test.ts`：从 cfg helper 删除该字段

## Phase B: 自动随机 seed
- [ ] **B.1** `app/page.tsx`：`defaultConfig` 改用 `Math.floor(Math.random() * 1e9)` 生成 seed
- [ ] **B.2** `app/page.tsx`：`startSim` 在 POST 前用新随机 seed 替换 `config.master_seed`
- [ ] **B.3** `components/ConfigPanel.tsx`：删除 seed 输入框与 🎲 按钮

## Phase C: 质量门 + 归档
- [ ] **C.1** `pnpm typecheck` / `pnpm lint` / `pnpm test` 全绿
- [ ] **C.2** spec deltas 合入 `openspec/specs/`
- [ ] **C.3** change 移至 `openspec/changes/archive/2026-05-26-simplify-config-ui/`
- [ ] **C.4** Decision Log 加一行
