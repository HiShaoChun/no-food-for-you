# Design: add-mvp-arena

记录 MVP 阶段的关键设计决策与权衡。每条决策都附"为什么"和"被否决的备选"。

---

## D1. 技术栈：Next.js 15 单仓 + TypeScript strict

**选择**：Next.js 15 App Router + TS strict + `pnpm`。

**为什么**：
- 一条 `pnpm dev` 同时跑前后端，符合"用户拉项目 5 分钟内看到画面"的定位
- App Router 的 Route Handler 原生支持 SSE 长连接（`ReadableStream` + `text/event-stream`）
- TS 端到端：engine 类型 / agent config / SSE 事件 schema 可在前后端共享
- `pnpm` 装包快、磁盘占用小，对"拉项目就跑"的体验友好

**被否决**：
- ~~FastAPI + Vite/React 双进程~~：能复用原 Python engine，但要用户装 `uv + node` 两套，门槛高一倍
- ~~Vite-only SPA + 假装无后端~~：LLM 调用必须在服务端（API key 不能出现在浏览器），无法纯前端

---

## D2. Provider 抽象：薄到不能再薄

**选择**：一个 `OpenAI` SDK 实例 + 不同 `baseURL` / `apiKey`，**无适配器模式**。

```ts
// lib/llm/providers.ts
export const PROVIDERS = {
  ark:      { envKey: "ARK_API_KEY",      envUrl: "ARK_BASE_URL"      },
  minimax:  { envKey: "MINIMAX_API_KEY",  envUrl: "MINIMAX_BASE_URL"  },
  zhipu:    { envKey: "ZHIPU_API_KEY",    envUrl: "ZHIPU_BASE_URL"    },
  deepseek: { envKey: "DEEPSEEK_API_KEY", envUrl: "DEEPSEEK_BASE_URL" },
  moonshot: { envKey: "MOONSHOT_API_KEY", envUrl: "MOONSHOT_BASE_URL" },
} as const;

export const MODELS = {
  "doubao-seed-code": { provider: "ark",      modelId: "doubao-seed-code" },
  "minimax-m2.7":     { provider: "ark",      modelId: "minimax-m2.7"     },
  "glm-5.1":          { provider: "ark",      modelId: "glm-5.1"          },
  "deepseek-v4-pro":  { provider: "ark",      modelId: "deepseek-v4-pro"  },
  "kimi-k2.6":        { provider: "ark",      modelId: "kimi-k2.6"        },
} as const;
```

**MVP 策略**：5 个模型 `provider` 全填 `ark`，对应 `ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3`。
**Phase 2 策略**：把 `provider` 字段改成各家原生（`minimax` / `zhipu` / ...），5 把独立 key，**无需改任何调用代码**。

**为什么不直接写死 ark**：将来 Ark 网关下架某模型，或想测各家原生协议差异，能立刻切换；多 provider 表的成本极小。

---

## D3. Agent 实例 & 配置数据模型

```ts
// lib/types/config.ts
export type ModelKey = keyof typeof MODELS;

export type AgentInstance = {
  id: string;                  // "A1" / "A2" / ... 系统自动编号
  display_name: string;        // 默认 "<model_key> #<n>"，用户可改
  model_key: ModelKey;
};

export type InformationMode =
  | { type: "open" }
  | { type: "blind" }
  | { type: "partial"; k: number };

export type PressureCurve =
  | { type: "constant"; amount: number }            // 每回合 -amount
  | { type: "linear"; start: number; step: number } // 第 t 回合 -(start + step*t)
  | { type: "step"; thresholds: number[] };         // 阶梯，例如 [10,20] 表示前 10 回合 -1，10–20 回合 -2，之后 -3

export type AllocationPolicy =
  | { type: "fully_free" }
  | { type: "capped"; cap: number }       // 单次响应分配总额 ≤ cap
  | { type: "proportional" };             // 收到 N 个请求时按请求 amount 权重分配，不能超过自己 energy

export type GameConfig = {
  agents: AgentInstance[];               // length 2–10
  shared_system_prompt: string;          // 所有 agent 共享，模型无关
  initial_energy: number;                // 默认 10
  max_rounds: number;                    // 默认 30
  max_requests_per_round: number;        // 每 agent 每回合最多发起的 request 数，默认 1
  info_mode: InformationMode;
  pressure: PressureCurve;
  allocation_policy: AllocationPolicy;
  master_seed: number;                   // 决定 RNG，影响请求投递顺序等
};
```

**为什么用 discriminated union（type 字段）而不是嵌套 object**：
- TS 类型穷举更安全（`switch (info_mode.type)` 编译期检查全部分支）
- JSON 序列化清晰，方便 phase 2 做配置分享/导入

---

## D4. 决策 Prompt 模板（写死中文，结构化 JSON 输出）

每回合发给每个 agent 的 prompt 由两部分拼接：

```
[shared_system_prompt]   // 用户在 UI 编辑

---
你是 <agent_id>（模型：<model_key>）。
当前回合: <n>/<max>
你的 Energy: <e>
所有 Agent Energy: { "A1": 5, "A2": 3, ... }

收件箱（来自 <信息模式决定的可见历史范围>）:
- A2 在第 11 回合对你说: "..."
- A3 在第 11 回合对你说: "..."

你必须从以下三个动作中选一个，回复 **纯 JSON**，不要任何额外解释：

1. 请求资源:
   {"action": "request", "target": "<其他 agent id>", "message": "<理由，≤100 字>"}

2. 响应分配（仅当收件箱非空时有意义）:
   {"action": "respond", "allocations": [{"to": "<id>", "amount": <整数>}, ...]}

3. 空行为:
   {"action": "noop"}

规则：
- 每回合你会被扣 <pressure 描述> 点 Energy 维持费
- Energy ≤ 0 你将被淘汰
- 分配的 amount 必须为正整数，总额不超过你当前 Energy
- 仅回复 JSON，禁止 markdown 代码块
```

**为什么写死中文**：5 个模型都是中文场景训练的，中文 prompt 表现明显优于英文。Phase 2 再做双语开关。

**JSON 输出策略**：
- 优先用 OpenAI SDK 的 `response_format: { type: "json_object" }`（Ark 兼容文档说支持）
- 失败时（旧模型不支持参数）回退到 prompt 强约束 + `JSON.parse` 尝试
- 任何解析失败 → 该 agent 本回合视为 No-op，事件流发 `parse_error` 事件

---

## D5. 5 阶段状态机的 TS 化

参考原项目 [engine/round.py](../../no-food-for-you/engine/round.py) 的设计，纯函数式（状态进、状态出）：

```ts
async function runRound(state: GameState, agents: AgentRuntime[]): Promise<RoundResult> {
  // ① 状态广播 — 构造每个 agent 看到的 view
  const views = agents.map(a => buildView(state, a, state.config.info_mode));

  // ② 决策阶段 — 并行调 LLM
  const decisions = await Promise.all(views.map((v, i) => agents[i].decide(v)));

  // ③ 请求聚合 — 按 master_seed RNG 决定 inbox 顺序
  const inboxes = aggregateRequests(decisions, state.rng);

  // ④ 响应执行 — 持有 inbox 的 agent 决定分配（再调一次 LLM）
  // ⚠ 注意：原项目的 Response 也在第 ② 阶段产出（agent 同时看自己上回合 inbox）。
  // 我们简化：把 Response 合并进 ② 决策，即 agent 在看 state.inboxes 后决定 request 或 respond。
  // 这样单回合只需调一次 LLM，省 token 一半。

  // ⑤ 结算 — 转移 + 扣维持费 + 淘汰
  return settle(state, decisions, inboxes);
}
```

**重要简化**：合并 ② 与 ④ 为一次 LLM 调用。**理由**：
- 节省 50% token
- 原项目 5 阶段是 spec 概念，引擎实现里也可以一次性问 agent "看到这些信息，你的本回合动作是？"
- 牺牲：上一回合的 inbox 在下一回合才被响应（延迟 1 回合的"对话节奏"）；MVP 阶段可接受，玩起来其实更像"邮件来回"

写进 spec 时说明这是 MVP 的实现选择，不是 spec 强制。

---

## D6. SSE 事件协议（一行一 JSON）

事件类型枚举：

```ts
type Event =
  | { type: "sim_started";     sim_id: string; config: GameConfig; t: string }
  | { type: "round_started";   sim_id: string; round: number; t: string }
  | { type: "agent_decision";  sim_id: string; round: number; agent: string;
      raw: string; parsed: AgentAction | null; parse_error?: string;
      tokens?: { input: number; output: number }; t: string }
  | { type: "round_settled";   sim_id: string; round: number;
      energies: Record<string, number>; eliminated: string[]; t: string }
  | { type: "sim_ended";       sim_id: string; reason: "max_rounds" | "all_eliminated" | "one_survivor";
      survivors: string[]; t: string };
```

`t` = ISO timestamp。

**双用**：
1. 前端通过 `GET /api/events/<sim_id>` 订阅，按到达顺序处理 UI 更新
2. 后端把同样的 JSON 写一行到 `runs/<sim_id>.jsonl`

这样 phase 2 做 replay viewer 时，直接读 JSONL → 复用同一套渲染逻辑。

---

## D7. 可视化技术选型

**选择**：[Recharts](https://recharts.org/) 做 energy 折线，**手写 SVG** 做聊天气泡布局。

**为什么不上 D3**：D3 灵活但学习曲线陡；MVP 没有联盟图（那个 phase 2 再说），折线 + 气泡 Recharts + 朴素布局就够了。**等 phase 2 加 coalition graph 时再引入 D3**。

**被否决**：
- ~~visx~~：库大，过度工程化
- ~~纯 canvas~~：可访问性差，截图分享时不友好

---

## D8. RNG 注入

```ts
// lib/engine/rng.ts —— 简易 mulberry32，足够 MVP
export function makeRng(seed: number): () => number { ... }
```

所有需要随机的地方（request 投递顺序、平局打破）从 `state.rng` 取，禁止 `Math.random()` 直接调用。lint rule 加上 `no-restricted-globals: Math.random`。

---

## D9. 项目目录最终态（MVP 完成时）

```
no-food-for-you-game/
├── .env.example
├── .gitignore                  # 含 .env, runs/, node_modules/, .next/
├── README.md                   # 重点：5 分钟快速开始
├── package.json
├── tsconfig.json               # strict: true
├── eslint.config.mjs
├── next.config.ts
├── pnpm-lock.yaml
├── openspec/                   # 本目录
├── app/
│   ├── layout.tsx
│   ├── page.tsx                # 主界面 = ConfigPanel + Arena
│   └── api/
│       ├── simulate/route.ts   # POST 开局，返回 sim_id
│       └── events/[sim_id]/route.ts # SSE 流
├── lib/
│   ├── llm/
│   │   ├── providers.ts        # PROVIDERS / MODELS 表
│   │   ├── client.ts           # getClient(provider)
│   │   └── availability.ts     # 启动探测 .env 哪些 key 已配
│   ├── engine/
│   │   ├── types.ts            # GameConfig / GameState / Event 等
│   │   ├── rng.ts
│   │   ├── round.ts            # 5 阶段实现（合并 ②④）
│   │   ├── settle.ts           # 结算与淘汰
│   │   └── view.ts             # 信息模式 → agent view
│   ├── agents/
│   │   ├── llm-agent.ts        # 单回合 → prompt → LLM → 解析
│   │   ├── stub-agent.ts       # 用于单测，返回固定 JSON
│   │   └── prompt-template.ts  # D4 的模板
│   └── registry.ts             # in-memory SimulationRegistry（sim_id → EventEmitter）
├── components/
│   ├── ConfigPanel.tsx
│   ├── AgentPicker.tsx
│   ├── Arena.tsx               # 容器
│   ├── ChatBubbles.tsx
│   ├── EnergyChart.tsx
│   ├── ProviderStatus.tsx      # 哪些 key 已配/未配
│   └── TokenMeter.tsx
├── tests/
│   ├── engine.test.ts          # vitest，stub agent 驱动
│   ├── rng.test.ts
│   ├── view.test.ts
│   └── parse.test.ts
└── runs/                       # gitignore
```

---

## 未决（不阻塞 MVP）
- Pressure curve 的 `step` 类型具体语义需要再细化（写到 simulation-engine spec 时定）
- Token 累计是否显示成"折算人民币"还是只显示 token 数（MVP 先只显示 token）
- 解析失败连续 N 次是否提前结束游戏（MVP 不做，让它跑完）
