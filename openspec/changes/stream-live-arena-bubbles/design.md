# Design — stream-live-arena-bubbles

## D1. Emission 时点的根本性调整

### 现状（问题根源）
`lib/engine/round.ts`：

```ts
const decisionRaw = await Promise.all(
  living.map(async (a) => {
    const view = buildDecisionView(state, a.id);
    const result = await a.decide_phase(view);
    return { agent_id: a.id, result };
  }),
);

// ↓ 等到这里时所有 agent 都已返回；下面循环立刻写出全部
const decision_events = decisionRaw.map(...);
// ...
for (const ev of decision_events) opts.emit({ type: "agent_decision_phase", ... });
```

慢的 agent 拖着快的等。后果就是「群聊一次冒一团」。

### 新方案
把 emit 推到**每个并发分支内部**：

```ts
// 1. Phase start broadcast — 立刻为每个 living agent 发一条 "started"
for (const a of living) {
  opts.emit({
    type: "agent_decision_started",
    sim_id: opts.sim_id,
    round: state.round,
    agent: a.id,
    phase: "decision",
    t: now(),
  });
}

// 2. 并发跑 LLM，每个 promise 自己 await + 自己 emit completion
const decisionRaw = await Promise.all(
  living.map(async (a) => {
    const view = buildDecisionView(state, a.id);
    const result = await a.decide_phase(view);
    opts.emit({
      type: "agent_decision_phase",
      sim_id: opts.sim_id,
      round: state.round,
      agent: a.id,
      raw: result.raw,
      parsed: result.parsed,
      ...(result.parse_error !== undefined ? { parse_error: result.parse_error } : {}),
      ...(result.policy_truncated !== undefined ? { policy_truncated: result.policy_truncated } : {}),
      ...(result.tokens !== undefined ? { tokens: result.tokens } : {}),
      t: now(),
    });
    return { agent_id: a.id, result };
  }),
);
// 整个 Promise.all 完成后才进入 phase 3 (request aggregation)
```

Response phase 完全镜像处理。`pledges_made_this_round` / `pledges_settled_this_round` 仍然是 phase 6 / 7 计算的结果，仍跟 `round_settled` 一起在 phase 7 末尾发出——这一点不变。

### 关键约束
- **同 phase 内**：agent 间 emit 顺序由 LLM call 完成顺序决定（先返回先 emit）。这就是「群聊感」的来源——快的先说话。
- **phase 间**：依然完全串行。`Promise.all` 仍是同步点：直到所有 agent 的 decision phase 都 emit 完，才会进入 request aggregation；直到所有 response phase emit 完，才会进入 pledge settlement + round_settled。这条约束在 simulation-engine spec 里反复出现，不动。
- **写盘顺序与 emit 顺序一致**：`lib/registry.ts` 的 `emitEvent` 已经把 `fs.appendFile` 用 `writeChain` 串行化（用户已修过这个 bug，见 `enhance-arena-feedback` 归档说明），不需要再改。

### 失败模式
- 某个 agent 的 `decide_phase` 抛错 → 该 agent 的 promise reject → `Promise.all` 整体 reject → 上面的 `runSimulation` 兜底是 `catch(async (err) => emit sim_ended)`，行为不变。问题：抛错的 agent 没 emit `agent_decision_phase`，UI 上其占位气泡会一直转圈。
  - **缓解**：让 `decide_phase` / `respond_phase` 实现层把错误 → 转成 `{ raw: "", parsed: null, parse_error: <msg> }` 而不是 throw。当前 `llm-agent.ts` 已经基本是这个语义（解析失败走 `parsed: null`），但 LLM 接口本身报错（401 / network）需要补一层 try/catch。这是必须做的小修，会放进 tasks.md。
  - 占位 UI 还有 60s 超时态兜底（见 D3）。

## D2. 新事件 schema

```ts
// lib/engine/types.ts (additions)

export type AgentDecisionStartedEvent = {
  type: "agent_decision_started";
  sim_id: string;
  round: number;
  agent: string;
  phase: "decision";  // 冗余但便于前端 switch
  t: string;
};

export type AgentResponseStartedEvent = {
  type: "agent_response_started";
  sim_id: string;
  round: number;
  agent: string;
  phase: "response";
  t: string;
};

// SimEvent union 调整：
// - 添加上面两个
// - 删除 LegacyAgentDecisionEvent
// - 删除 LegacyRequestAction / LegacyRespondAction / LegacyNoopAction / AgentAction
```

### 设计取舍
- 为什么不复用单一 `agent_phase_started` 带 discriminator？两个具体事件名跟 `agent_decision_phase` / `agent_response_phase` 配对更清晰，dedupe key 直接走 `type:round:agent` 没有 phase 后缀歧义。前端 switch 也更线性。
- 为什么 `phase` 字段冗余还要保留？`type` 已经隐含 phase，但前端把"started"事件作为占位的元数据时，复用同一组渲染逻辑（占位组件接 `{agent, phase}`）会比再做字符串切割更顺手。

## D3. UI 端：占位 → 替换

### 数据流
现状 `app/page.tsx`：

```ts
es.onmessage = (msg) => {
  const ev = JSON.parse(msg.data) as SimEvent;
  const key = dedupeKey(ev);
  if (seenKeys.current.has(key)) return;
  seenKeys.current.add(key);
  setEvents((prev) => [...prev, ev]);
  // ...
};
```

`events` 是简单 append 的列表，`ChatBubbles` 单遍扫描渲染。新方案：

- `dedupeKey` 扩 case：
  ```ts
  case "agent_decision_started":
  case "agent_response_started":
    return `${e.type}:${e.round}:${e.agent}`;
  ```
- 列表仍然 append-only，但 `ChatBubbles` 渲染时做"占位归并"：维护一个 `Map<(round,agent,phase) → "started" | <PhaseEvent>>`，遇到 `_phase` 时把已有的 `_started` 占位替换。React key 仍按 `(round, agent, phase)` 稳定，从而占位组件原地变身完整气泡，不抖。
- 同时为「按到达顺序排列」做铺垫：渲染顺序就是 events 数组顺序，而 events 数组顺序 = SSE 到达顺序 = LLM 完成顺序。无需额外排序逻辑。

### 占位组件
```tsx
function ThinkingBubble({ agent, agents, phase }): React.ReactElement {
  const color = agentColor(agents, agent.id);
  return (
    <div className="bubble thinking" data-phase={phase}>
      <div className="head">
        <Avatar color={color} />
        <span className="name">{agent.display_name}</span>
        <span className="chip phase">{phase === "decision" ? "决策" : "响应"}</span>
      </div>
      <div className="body">
        <span className="thinking-dots"><span/><span/><span/></span>
        <span className="thinking-label">正在思考…</span>
      </div>
    </div>
  );
}
```

CSS：3 个 8px 圆点，依次 fade 透明度 0.3→1→0.3，跑 1.2s ease-in-out infinite，相位差 0.2s。

### 60s 软超时
占位组件用 `useEffect` 起一个 `setTimeout(60_000)`，到点把 className 切到 `thinking timeout`，文字变成 `「响应超时·等待中」`，配色 `--warning`。 60s 是经验值：deepseek/glm 平均 8-15s，p99 一般 < 30s；60s 留足余量但不会让用户在浏览器前傻等十分钟。

如果对应的 `_phase` 事件最终到达，占位仍会被替换（取消 setTimeout 在 unmount 时自然完成）。

## D4. Agent Mention Chip

### 现状
`ChatBubbles.tsx` 里 `→ doubao-seed-code #2` 是纯字符串：

```tsx
<span className="arrow">→</span>
<span>{nameOf(r.target)}</span>
```

### 新组件
```tsx
function AgentMention({
  agents,
  id,
  onHoverChange,
}: {
  agents: AgentInstance[];
  id: string;
  onHoverChange?: (id: string | null) => void;
}): React.ReactElement {
  const color = agentColor(agents, id);
  const name = agents.find((a) => a.id === id)?.display_name ?? id;
  return (
    <span
      className="mention"
      data-agent-id={id}
      style={{ ["--mention-color" as string]: color }}
      onMouseEnter={() => onHoverChange?.(id)}
      onMouseLeave={() => onHoverChange?.(null)}
    >
      <span className="mention-dot" aria-hidden />
      <span className="mention-name">@{name}</span>
    </span>
  );
}
```

样式：内联 chip，背景 `color-mix(in srgb, var(--mention-color) 18%, transparent)`，文字 `var(--mention-color)`，圆角 `--radius-pill`，padding `1px 6px 1px 4px`，dot 5px。

### 高亮联动
`Arena` 持有 `hoveredAgentId: string | null` state，往下传给：
- `ChatBubbles`（接受 `onHoverChange` 回调）
- `EnergyChart`（被 hover 时把对应 `<Line>` `strokeWidth` 调到 4 + 其他降到 1.5）
- `AgentPicker` / 左栏 agent 行（被 hover 时背景变 `--surface-hover`）

在 `Arena.tsx` 里：
```tsx
const [hovered, setHovered] = useState<string | null>(null);
```

把 `setHovered` 透传，并加 CSS 选择器 `[data-agent-id="..."]` 来做行高亮。

性能：hover 事件 React 处理足够便宜（3-10 agent 量级）；不引入额外的虚拟化或 ref 操作。

## D5. Sticky Scroll + 浮标

### 现状
`ChatBubbles.tsx`：

```tsx
useEffect(() => {
  const el = ref.current;
  if (el) el.scrollTop = el.scrollHeight;
}, [events.length]);
```

无脑滚到底。用户往上看历史时会被新事件硬拽下来。

### 新逻辑
封装 `useStickyScroll(ref, deps)`：

```ts
function useStickyScroll(ref: RefObject<HTMLDivElement>, deps: unknown[]) {
  const [pinned, setPinned] = useState(true);   // 是否贴底
  const [newCount, setNewCount] = useState(0);

  // 滚动事件：维护 pinned 状态
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const wasPinned = pinned;
      const nowPinned = distance < 64;
      if (wasPinned !== nowPinned) setPinned(nowPinned);
      if (nowPinned) setNewCount(0);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref, pinned]);

  // deps 变化时：贴底则滚，否则计数
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (pinned) {
      el.scrollTop = el.scrollHeight;
    } else {
      setNewCount((c) => c + 1);
    }
  }, deps);

  const jumpToBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setPinned(true);
    setNewCount(0);
  }, [ref]);

  return { pinned, newCount, jumpToBottom };
}
```

UI：浮标按钮绝对定位在 `.bubbles` 容器右下，`bottom: 16px; right: 16px`，背景 `--surface`，边 `--border-strong`，文字 `--accent`，只在 `!pinned && newCount > 0` 时渲染。

### 阈值取舍
- 64px：等价于"用户主动往上滚出了一两条气泡的高度"。比 0 宽松（避免每次滚动微小抖动就解除贴底），比 200px 严格（避免用户只是看了下底部上面就被算作"离开"）。
- 新消息计数器只数 events 数组长度增量。占位 → phase 替换不会重复计数（events 数组只 append，已存在事件不增长长度）。但是 `_started` 与 `_phase` 是**两个独立 event**——意味着如果用户处于离底状态，单个 agent 一次决策会被算作 +2 条新消息。这没毛病：从体感看，确实有"开始想"和"想完了"两个时刻，浮标计数表达"你错过了 N 次内容更新"是准确的。

## D6. 事件顺序与去重

### dedupeKey 扩张
`app/page.tsx`：

```ts
function dedupeKey(e: SimEvent): string {
  switch (e.type) {
    case "agent_decision_started":
    case "agent_response_started":
    case "agent_decision_phase":
    case "agent_response_phase":
      return `${e.type}:${e.round}:${e.agent}`;
    case "round_started":
    case "round_settled":
      return `${e.type}:${e.round}`;
    case "sim_started":
    case "sim_ended":
      return e.type;
  }
}
```

注意：legacy `agent_decision` case 删除（连同 `LegacyAgentDecisionEvent` 一起从 union 中删）。

### SSE 重连场景
- 连接断开后客户端 `EventSource` 重连，服务端从 backlog 全量重放。
- backlog 里 `_started` 与 `_phase` 都在；client 用 dedupeKey 去重，已渲染的不再 append；events 数组保持原顺序。
- 占位归并逻辑（`Map<(round,agent,phase) → _started | _phase>`）对重放的 `_started` 不敏感——如果对应的 `_phase` 已经在 events 数组中，渲染时直接走 `_phase` 分支，`_started` 占位不出现。
- 边界：用户在 phase 中途断网重连，可能短暂看到「先收到 `_phase` 后收到 `_started`」（如果 backlog 写入瞬序如此）。占位归并需要双向检查：渲染时按 `(round, agent, phase)` 查找 events 数组里有没有对应的 `_phase`，有则不渲染占位。这一点单测覆盖。

## D7. 测试矩阵

| 场景 | 文件 | 重点 |
|---|---|---|
| Phase start 事件早于 phase 事件 | tests/engine.test.ts (新) | `_started` 在 `_phase` 之前进入 emit log |
| 同 phase 内先完成的 agent 先 emit `_phase` | tests/engine.test.ts | 用两个 stub agent，一个 sleep 50ms 一个立即返回，断言事件顺序 |
| Phase 间串行：所有 `_phase` 在 `round_settled` 之前 | tests/engine.test.ts | 与原状一致，回归 |
| Phase 间串行：所有 `decision_phase` 都到了才出现 `response_started` | tests/engine.test.ts | 关键约束 |
| Stub agent 抛错时 emit 行为 | tests/engine.test.ts | `_started` 已发；`_phase` 应仍发 parsed:null 而非完全缺失 |
| dedupe 重放后占位不复发 | tests/registry.test.ts | backlog 重放路径不重复 |
| TS strict 编译通过 | typecheck | 删除 legacy union 后无 dangling import |

预期单测从 81 (现状) → 84+。手测项见 proposal 验收。

## D8. 出场顺序与回滚

实现顺序（每步独立可绿）：

1. **types + emit**（不动 UI）：types 新增两个 event，删 legacy；`round.ts` 改 emit 时点；jsonl 写入；engine 测试。此时 UI 因为缺少新 case 默认会忽略 `_started` 事件——表现等同改之前（批量出现），但不报错。
2. **UI 占位**：扩 `dedupeKey`、`ChatBubbles` 加 `ThinkingBubble` + 归并逻辑；删 `LegacyDecisionBubble`。
3. **Mention chip**：抽 `AgentMention` 组件，所有目标 ID 渲染走它。
4. **Sticky scroll**：`useStickyScroll` + 浮标。

每步独立 PR-able，但用户已选 OpenSpec 一锅炖：实际只起一个 change，一气合到 main。

回滚方案：因为本提案只动 `lib/engine/round.ts` 的 emit 顺序 + UI 渲染逻辑，回滚就是 git revert 一个 commit。state machine、settle、parse、prompt 都没动，回滚风险极低。

## D9. 不做（与 proposal Out 重复，但在 design 里说明决策依据）

- **不做 LLM 真·token 流式**：拆 streaming SDK 牵动 5 个 provider 的 client 实现；OpenAI 兼容 streaming 在 doubao/glm/minimax 等网关的 chunk 分隔符行为不一致；结构化 JSON 输出在中途是不完整的——要做"先流文本预览，最后用完整 JSON 校正"双轨。代价远超本提案体量。"完成即 emit + 占位"已经把"群聊感"做到 80 分，到 95 分的距离不值现在投入。
- **不做虚拟滚动**：现状气泡量级（≈ 200 条/局）远未到 React DOM 性能边界；过早抽象。
- **不做声音通知 / 桌面 push**：脱离 MVP 焦点。
