# Tasks: tune-agent-voice

## Phase A: 数据模型（schema 扩展，向后兼容）
- [ ] **A.1** `lib/engine/types.ts`：`Allocation` 加 `reason?: string`
- [ ] **A.2** `lib/engine/types.ts`：`HistoryEvent.transfer` 加 `reason?: string`
- [ ] **A.3** `lib/engine/types.ts`：`round_settled.transfers[i]` 加 `reason?: string`

## Phase B: 解析器
- [ ] **B.1** `lib/agents/parse.ts`：respond.allocations 解析时如有 reason 字符串则保留
- [ ] **B.2** `tests/parse.test.ts`：测 "带 reason 的 respond 正常解析"、"reason 缺失时仍然合法"、"reason 非字符串时丢弃"

## Phase C: 引擎贯穿 reason
- [ ] **C.1** `lib/engine/settle.ts`：transfer 应用时把 reason 传到 `transfers` 数组和 `eventsThisRound` 的 HistoryEvent
- [ ] **C.2** `tests/engine.test.ts`：跑一个 stub agent 带 reason → round_settled.transfers[0].reason 存在
- [ ] **C.3** `lib/agents/stub-agent.ts`：可选——给 `respond_first_inbox` 加一个 `reason` 字段，测试用

## Phase D: Prompt
- [ ] **D.1** `lib/agents/prompt-template.ts`：扩 `DEFAULT_SHARED_SYSTEM_PROMPT`，追加"说话风格"段（4 条规则 + 9 条范本 + 自检指令）
- [ ] **D.2** `lib/agents/prompt-template.ts`：`buildPrompt` 的 JSON schema 示例里 allocations 加 `"reason": "<可选...>"`

## Phase E: UI
- [ ] **E.1** `components/ChatBubbles.tsx`：respond bubble 里渲染 reason（amount 后跟小字 reason）
- [ ] **E.2** `components/RoundSettleCard.tsx`：transfer chip 的 `title` attribute 写 reason；视觉不变以避免溢出

## Phase F: 质量门
- [ ] **F.1** `pnpm typecheck` 全绿
- [ ] **F.2** `pnpm lint` 全绿
- [ ] **F.3** `pnpm test` 全绿

## Phase G: 归档
- [ ] **G.1** 把 spec deltas 合入 `openspec/specs/<capability>/spec.md`
- [ ] **G.2** 移动 change 到 `openspec/changes/archive/2026-05-26-tune-agent-voice/`
- [ ] **G.3** 更新 `openspec/project.md` Decision Log
