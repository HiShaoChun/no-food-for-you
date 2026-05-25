# No Food For You · Arena

> 让 5 个国产 LLM 在浏览器里互相博弈生存——一个语言驱动的多智能体生存模拟 Web 端可玩版。

灵感来自研究项目 [no-food-for-you](../no-food-for-you/)；本仓库是面向**普通玩家/研究者**的开箱即玩版：拉项目、填一把 key、`pnpm dev`，开打。

---

## 5 分钟跑起来

### 1. 装依赖

需要 **Node 20+** 和 **pnpm 9+**：

```powershell
# Windows: 用 corepack 或 npm 装 pnpm
npm install -g pnpm@9

# 装项目依赖
pnpm install
```

### 2. 配置 API Key

```powershell
Copy-Item .env.example .env
notepad .env
```

填入 **Volcengine Ark 火山方舟** 的 API key 和网关 URL：

```env
ARK_API_KEY=sk-...
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
```

> **这一把 key 就够了**——Ark 网关代理了 doubao / minimax / glm / deepseek / kimi 共 5 个模型。
> 其它 4 把 key (MINIMAX/ZHIPU/DEEPSEEK/MOONSHOT) 是给 Phase 2 用的，MVP 阶段留空即可。

### 3. 启动

```powershell
pnpm dev
# 打开 http://localhost:3000
```

界面顶部会显示 5 个 provider 的状态条——绿色 = 已配置，灰色 = 未配置。

---

## 玩法

1. **左侧 Config Panel**：
   - 增删 Agent（2–10 个，同一模型可多开）
   - 编辑共享 System Prompt（所有 agent 共用，模型无关）
   - 调整初始 energy / 最大回合数 / 信息模式 / 压力曲线 / 分配策略 / 随机种子
2. **点击 Start**：后端调 5 个 LLM 跑回合制博弈，SSE 实时推送事件
3. **右侧 Arena**：
   - 顶部 energy 折线图（每个 agent 一条线）
   - 中间聊天气泡（请求 / 分配 / 解析失败）
   - 底部 token 累计

每局完整记录会落到 `runs/<sim_id>.jsonl`，未来可用于 replay。

---

## 内置规则速览

| 元素 | 说明 |
|---|---|
| **唯一资源** | Energy（整数）。`>0` 存活，`≤0` 淘汰 |
| **唯一动作** | `request`（求救） / `respond`（分配） / `noop`（无动作），LLM 输出纯 JSON |
| **回合流程** | 5 阶段状态机：广播 → 决策（并行）→ 请求聚合 → 响应执行 → 结算 |
| **维持费** | 每回合扣 Energy（constant / linear / step 三种压力曲线） |
| **信息模式** | open（全历史）/ blind（只看当前）/ partial（最近 K 回合） |
| **分配策略** | fully_free / capped / proportional |
| **终止条件** | 达到 max_rounds / 全部淘汰 / 只剩一人 |

---

## 开发

```powershell
pnpm dev          # 开发服务器
pnpm test         # vitest run
pnpm typecheck    # tsc --noEmit (strict 模式)
pnpm lint         # next lint
pnpm build        # 生产构建
```

**提交前必须全绿**。

### 项目结构

```
no-food-for-you-game/
├── app/                    # Next.js App Router
│   ├── page.tsx            # 主界面（Config + Arena）
│   └── api/
│       ├── simulate/       # POST 开局
│       ├── events/[id]/    # SSE 流
│       └── availability/   # 探测 .env 配置状态
├── components/             # React 组件
├── lib/
│   ├── engine/             # 回合制状态机（同步）
│   ├── llm/                # provider 注册表 + OpenAI 兼容 client
│   ├── agents/             # prompt 模板 + LLM agent + 解析 + stub
│   └── registry.ts         # in-memory sim registry + JSONL 落盘
├── tests/                  # vitest（53 单测 + 集成）
├── runs/                   # 模拟日志（gitignore）
└── openspec/               # 规范驱动开发的真相源
    ├── project.md
    ├── specs/              # 当前生效的能力规格
    └── changes/archive/    # 历史变更
```

---

## OpenSpec

本项目用 OpenSpec 规范驱动开发，每个能力都有契约。改任何能力前先读 [`openspec/AGENTS.md`](openspec/AGENTS.md)。

当前能力：
- [simulation-engine](openspec/specs/simulation-engine/spec.md) — 回合机
- [llm-providers](openspec/specs/llm-providers/spec.md) — 模型注册与可用性
- [agent-config](openspec/specs/agent-config/spec.md) — 配置数据模型 + prompt
- [event-stream](openspec/specs/event-stream/spec.md) — SSE + JSONL
- [arena-ui](openspec/specs/arena-ui/spec.md) — Web 界面

---

## License

MIT
