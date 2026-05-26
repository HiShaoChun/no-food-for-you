# Tasks: remove-info-mode

## Phase A: 删类型与 schema
- [ ] **A.1** `lib/engine/types.ts`：删 `InformationMode` 类型导出
- [ ] **A.2** `lib/engine/types.ts`：从 `GameConfig` 删 `info_mode` 字段
- [ ] **A.3** `lib/engine/types.ts`：`AgentView.history` 注释 "filtered by info_mode" → "full history of public events"
- [ ] **A.4** `lib/config-schema.ts`：删 `InformationModeSchema` 常量
- [ ] **A.5** `lib/config-schema.ts`：从 `GameConfigSchema` 删 `info_mode` 字段

## Phase B: 删 view 过滤逻辑
- [ ] **B.1** `lib/engine/view.ts`：删 `filterHistory` 函数与 `InformationMode` import
- [ ] **B.2** `lib/engine/view.ts`：`buildView` 里 `history: filteredHistory` → `history: state.history`

## Phase C: 删 UI 控件
- [ ] **C.1** `components/ConfigPanel.tsx`：删 `InformationMode` import
- [ ] **C.2** `components/ConfigPanel.tsx`：删 "信息模式" `<div className="section">` 整块
- [ ] **C.3** `components/ConfigPanel.tsx`：删 `InfoModeControl` 函数
- [ ] **C.4** `app/page.tsx`：从 `defaultConfig` 返回值删 `info_mode` 字段

## Phase D: 清理测试
- [ ] **D.1** `tests/view.test.ts`：删 `describe("buildView — information modes")` 整块（含 5 项 history 数组）
- [ ] **D.2** `tests/view.test.ts`：从 `baseConfig` 删 `info_mode` 字段
- [ ] **D.3** `tests/engine.test.ts`：cfg helper 删 `info_mode`；删 line 288 的 `info_mode: { type: "blind" }` 覆盖
- [ ] **D.4** `tests/registry.test.ts`：cfg helper 删 `info_mode`

## Phase E: 质量门 + 归档
- [ ] **E.1** `pnpm lint` 零警告
- [ ] **E.2** `pnpm typecheck` 通过
- [ ] **E.3** `pnpm test` 全绿（预期单测数量减少 3）
- [ ] **E.4** 浏览器 smoke：起 dev server，开 `/`，确认 Config Panel 不再有"信息模式"section，Start 一局跑完
- [ ] **E.5** 把 3 份 spec delta 合入 `openspec/specs/`（agent-config / arena-ui / simulation-engine）
- [ ] **E.6** change 目录移至 `openspec/changes/archive/2026-05-26-remove-info-mode/`
- [ ] **E.7** `openspec/project.md` Decision Log 追加一行
