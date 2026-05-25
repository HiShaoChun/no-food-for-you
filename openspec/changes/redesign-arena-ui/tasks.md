# Tasks — redesign-arena-ui

- [x] 1. 写 proposal / design / spec delta
- [x] 2. 改 `app/globals.css`：注入新设计令牌、卡片、bubble、chip、divider、scrollbar、focus 样式
- [x] 3. 改 `components/ProviderStatus.tsx`：header 重排（品牌 + sim 状态 chip + provider pill 行）
- [x] 4. 改 `components/AgentPicker.tsx`：在每行加 agent 颜色徽标
- [x] 5. 改 `components/ConfigPanel.tsx`：每个 section 包成 `.card`，调整 Start 按钮 class
- [x] 6. 改 `components/EnergyChart.tsx`：自定义 tooltip + 节点 dot + 等宽数字
- [x] 7. 改 `components/ChatBubbles.tsx`：头像 + chip + round 胶囊
- [x] 8. 改 `components/TokenMeter.tsx`：mono 数字、状态对齐
- [x] 9. `app/page.tsx` 传 sim 状态给 header（idle / running / ended）
- [x] 10. `pnpm lint && pnpm typecheck && pnpm build` 全绿
- [ ] 11. （归档时由维护者完成）合并 delta 到 `specs/arena-ui/spec.md` 并移到 `archive/`
