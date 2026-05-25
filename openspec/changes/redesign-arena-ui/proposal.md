# redesign-arena-ui

## 为什么
当前 MVP 的 Arena 页面功能完整但视觉层级薄弱：

- 标题栏与 provider 状态混在一起，没有当前 sim 运行状态指示，用户分不清"待命 / 进行中 / 已结束"
- 左侧配置面板段落之间没有视觉分组，连续滚动一片"灰盒子+表单"，缺少呼吸感
- agent 列表里看不出每个 agent 在图表里对应哪条线（颜色身份没贯穿）
- ChatBubbles 全部一个样：发起者、动作类型、目标都靠纯文字读，没有可扫视的形状/色块/chip
- 折线图用 recharts 默认外观，tooltip / 网格 / dot 都没调优，比例与轴标签在小屏上挤成一团
- 整体配色饱和度偏低，10 个 agent 颜色没和谐过，并排放一起会"打架"
- TokenMeter 数字非等宽，跳动时阅读体验差

## 改什么（高层）

**只动表现层（CSS / DOM 结构 / 组件视觉），不改任何业务行为、API 协议、配置语义、事件流。**

1. 引入显式的 **设计令牌（design tokens）**：颜色、字号、行高、间距、圆角、阴影、agent 调色板，统一从 `globals.css` 的 `:root` 注入。
2. 顶部 header 改为：左侧品牌标识 + 当前 sim 状态 chip（idle / running / ended-reason）+ 右侧 provider 健康指示组。
3. 左侧配置面板拆为"卡片"：Agents / Prompt / 参数 / 信息模式 / 压力 / 分配 / Start。卡片有标题、辅助说明、内部留白。
4. Agent 行加入 **颜色徽标**——这个色与该 agent 在折线图、聊天气泡头像中的颜色严格一致，建立视觉身份。
5. ChatBubbles 改为"头像（彩色圆）+ 名称 + 动作 chip（Request / Allocate / Noop / Error）+ 内容"。round divider 用胶囊徽章而非全宽分割线。
6. 折线图启用自定义 tooltip、淡色网格、首末点 dot、轴单位标签、动画 200ms。
7. Start 按钮做成 primary CTA（渐变背景、聚焦光晕），disabled 态文案保留可读。
8. 全局数字用 tabular-nums + JetBrains Mono fallback，token 计数不抖动。
9. 修复几个细节：滚动条样式、聚焦态可见、输入框 padding、空状态文案与图标。

## 不动什么（out-of-scope）

- 不引入 Tailwind、CSS-in-JS 或任何 UI 库，沿用纯 CSS + CSS 变量（保持构建/依赖轻）
- 不改 `lib/`、`app/api/`、`openspec/specs/{simulation-engine, llm-providers, agent-config, event-stream}/`
- 不改后端事件结构、配置类型、模型注册表
- 不引入第三方字体（仅 CSS `font-family` 降级链中加入 `JetBrains Mono` 作为可选）
- 不做响应式断点（MVP 仍假设桌面 >=1280px；只确保左栏 360px、右栏 1fr 在常见笔记本宽度可读）

## 影响的 capabilities

仅 `arena-ui`。在 `specs/arena-ui/spec.md` 追加一个 **Visual Design System** Requirement，使行为型 Requirement 中的"green / gray / 灰色气泡"等措辞与该 Requirement 中的设计令牌挂钩，但不收紧或放宽任何原有行为约束。

## 风险

- 低：纯样式 + 组件结构调整，TS 类型与公共 prop 不变；既有单测全部在 `lib/` 层，不依赖 DOM 结构。
- 视觉回归靠人眼审查 + 截图比对。MVP 阶段没有视觉回归测试基础设施，不在本提案引入。

## 验收

1. `pnpm lint` / `pnpm typecheck` / `pnpm test` 三道质量门全绿
2. `pnpm build` production 构建成功
3. 在 1440×900 / 1920×1080 两个分辨率下：
   - header 不换行，provider pill 全部可见
   - 左栏可滚动至 Start 按钮，所有控件无重叠
   - 右栏图表占顶部约 280px，聊天区可滚动，footer 常驻
4. 跑一轮 3 agent × 6 round 的真实 sim：bubbles 中 Request/Allocate/Noop/Error 四种状态视觉可区分
