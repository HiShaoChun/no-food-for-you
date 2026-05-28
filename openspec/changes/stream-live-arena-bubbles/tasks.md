# Tasks — stream-live-arena-bubbles

- [x] 1. 写 proposal / design / spec delta（本提案）

## Phase 1：引擎 emit 时点 + 事件 schema

- [x] 2. `lib/engine/types.ts`：新增 `AgentDecisionStartedEvent` / `AgentResponseStartedEvent`；从 `SimEvent` union 删除 `LegacyAgentDecisionEvent`；同时删除 `LegacyRequestAction` / `LegacyRespondAction` / `LegacyNoopAction` / `AgentAction`（legacy union）；处理所有 dangling import / unused export 让 strict 通过
- [x] 3. `lib/engine/round.ts`：
  - 在 decision phase 进入前，对每个 living agent emit `agent_decision_started`
  - 把 decision phase 内的 `Promise.all(map...)` 改成「每个 promise 内部 await 后立刻 emit `agent_decision_phase`」，不再在 phase 结束后批量 emit
  - response phase 镜像同样改造
  - phase 间仍用整个 `Promise.all` 作同步点（不变）
- [x] 4. `lib/agents/llm-agent.ts`：在 `decide_phase` / `respond_phase` 外层加 try/catch，把 LLM 网络/HTTP 错误转成 `{ raw: "<error msg>", parsed: null, parse_error: "<reason>" }`，避免 promise reject 导致占位气泡永不被替换
- [x] 5. 新增 `tests/streaming.test.ts`：
  - `_started` 必须早于同 agent 同 phase 的 `_phase`
  - 同 phase 内先完成的 agent 的 `_phase` 先 emit（用 2 个 sleep 不同长度的 stub）
  - 所有 decision `_phase` 都到了之后，才出现任何 response `_started`
  - 所有 response `_phase` 都到了之后，才出现 `round_settled`
- [x] 6. 跑 `pnpm test`：包含上面 4 个新测试在内全绿

## Phase 2：UI 占位 + 删 legacy 渲染

- [x] 7. `app/page.tsx`：扩 `dedupeKey` 覆盖 `agent_decision_started` / `agent_response_started`
- [x] 8. `components/ChatBubbles.tsx`：
  - 删 `LegacyDecisionBubble` 函数与相关分支
  - 新建 `ThinkingBubble`（占位）组件，含 3 点跳动动画与 60s 软超时态
  - 渲染主循环改用 `Map<(round,agent,phase) → "started" | <PhaseEvent>>` 做占位归并；遇到 `_phase` 时原地替换 `_started`，React key 用 `(round, agent, phase)` 保稳
  - 删 `useEffect(... scrollTop = scrollHeight, [events.length])`，让 sticky scroll hook 接管（见 Phase 4）
- [x] 9. `app/globals.css`：新增 `.bubble.thinking`、`.thinking-dots`、`.thinking-label`、`.bubble.thinking.timeout` 样式；点跳动 keyframes
- [x] 10. 跑 `pnpm typecheck && pnpm lint`：全绿

## Phase 3：Agent Mention Chip + Hover 联动

- [x] 11. `components/ChatBubbles.tsx`：抽 `AgentMention` 子组件；`DecisionPhaseBubble` / `ResponsePhaseBubble` / `PledgeChips` 中所有 `nameOf(target_id)` 调用改成 `<AgentMention agents={agents} id={...} onHoverChange={...} />`
- [x] 12. `components/Arena.tsx`：加 `hovered: string | null` state，下传给 `ChatBubbles`（`onHoverChange={setHovered}`）、`EnergyChart`（新 prop `hoveredId`）、左栏 panel 通过 `data-agent-id` 选择器自身响应
- [x] 13. `components/EnergyChart.tsx`：接受 `hoveredId`，被 hover 的 line 加粗（`strokeWidth: 4`），其他 line 降到 `strokeWidth: 1.5 + strokeOpacity: 0.6`
- [x] 14. `components/AgentPicker.tsx`：每行包到一个 `[data-agent-id="..."]` 容器；CSS 给 `[data-agent-id]:hover, [data-agent-id].is-hovered` 加 `--surface-hover` 背景
- [x] 15. `app/globals.css`：`.mention` chip 样式（color-mix 背景、彩点、padding、radius-pill）；hover 高亮选择器

## Phase 4：Sticky Scroll + 浮标

- [x] 16. 新建 `components/hooks/useStickyScroll.ts`：实现 D5 描述的 hook（`pinned` + `newCount` + `jumpToBottom`），阈值 64px
- [x] 17. `components/ChatBubbles.tsx`：调用该 hook；在 `.bubbles` 内部底部右下渲染 `<button class="jump-to-bottom">N 条新消息 ↓</button>`，只在 `!pinned && newCount > 0` 显示
- [x] 18. `app/globals.css`：`.jump-to-bottom` 按钮样式（绝对定位、`--surface`、`--accent` 字、subtle shadow、出现/隐藏动画）

## Phase 5：清理 + 收尾

- [x] 19. `components/TokenMeter.tsx`：移除 legacy `agent_decision` 累加分支（switch case 直接删除）
- [x] 20. 全仓 grep `agent_decision`（不含 `_phase` / `_started` 后缀）和 `Legacy*Action` / `LegacyAgentDecisionEvent`，确认无残留
- [ ] 21. 手测（待用户验证）：3 agent × 6 round 真实 sim，确认
  - 最快返回的 agent 气泡先出现（不再统一等齐）
  - 慢 agent 显示「正在思考」占位，到点 in-place 替换
  - hover `@芯片` 时 chart line / 左栏 agent 行同步高亮
  - 向上滚 ≥ 64px 后底部出现「N 条新消息 ↓」浮标，点击回到底部
- [x] 22. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 全绿（89/89 单测通过、lint/typecheck/build 零警告）
- [ ] 23. （归档时由维护者完成）合并 delta 到对应 `openspec/specs/<capability>/spec.md` 并移到 `openspec/changes/archive/YYYY-MM-DD-stream-live-arena-bubbles/`；在 `openspec/project.md` Decision Log 追加一行
