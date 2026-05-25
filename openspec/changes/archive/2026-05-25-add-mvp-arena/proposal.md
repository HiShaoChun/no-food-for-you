# Proposal: add-mvp-arena

## Why
启动 `no-food-for-you-game` 项目的首个可运行版本。目标：**5 分钟内**，用户从 git clone 到看见 5 个国产 LLM 在浏览器里互相要资源、活下来或被淘汰。

这是从 0 到 1 的奠基性 change——之后所有能力（replay、metrics、jurisdiction…）都构建在这个 MVP 之上。

## What Changes
新增 5 个能力（全部 `ADDED`，无 MODIFIED）：

| Capability | 一句话职责 |
|---|---|
| `simulation-engine` | 5 阶段回合机 + seed 驱动 RNG + 状态结算 |
| `llm-providers` | 5 个 OpenAI 兼容模型注册表 + `.env` 加载 + 可用性探测 |
| `agent-config` | 把"挑哪些模型/同模型多开/共享 prompt"建模成可序列化 config |
| `arena-ui` | 配置表单 + Start 按钮 + 实时聊天气泡 + energy 折线 |
| `event-stream` | 后端 SSE 协议 + JSONL 落盘格式（双用：直播源 + 归档） |

## Scope

### In
- Next.js 15 + TypeScript strict 项目骨架
- `.env.example` + `.gitignore`
- 5 个模型走单一 Ark 网关 (`https://ark.cn-beijing.volces.com/api/coding/v3`)，单把 `ARK_API_KEY`
- 同步回合机（单回合内 agent 决策 `Promise.all` 并行；跨回合严格串行）
- 三种信息模式（open / blind / partial）
- 三种压力曲线（constant / linear / step）
- 三种分配策略（fully_free / capped / proportional）
- Agent 数量动态 2–10 个，同模型可多开
- 解析失败的 LLM 输出 → 当回合视为 No-op，日志记 `parse_error`
- 浏览器看实时聊天气泡 + energy 折线（D3 或 visx，二选一在 design.md 决）
- JSONL 落到 `runs/<sim_id>.jsonl`
- 单测：engine 用 stub agent 驱动，覆盖 5 阶段状态机

### Out（明确不做）
- ❌ Replay viewer（加载历史 JSONL 回放）
- ❌ Metrics（Gini / coalition graph / coercion judge）
- ❌ Jurisdiction 第 4.5 阶段（裁决系统）
- ❌ 异步引擎（同步先跑通）
- ❌ 数据库 / SQLite / 任何持久化（除 JSONL 文件）
- ❌ 用户系统 / 鉴权 / 多人观战 / 房间码
- ❌ 5 把独立 key（保留代码路径，但 MVP 只用 ark 一把）
- ❌ Provider 切换 UI（用户在 UI 选**模型**，provider 由 `MODELS` 表反查）
- ❌ Prompt 模板可视化编辑器（MVP 用 `<textarea>` 编辑 base prompt）
- ❌ 多语言（中文写死，英文留 phase 2）

## Impact
- **新建项目**：所有 `specs/` 目录都是空白起步
- **不破坏任何现有契约**（没有现有契约）
- **依赖原项目**：仅作为设计参考，不复用代码、不引用原仓库

## Risks
| 风险 | 缓解 |
|---|---|
| Ark 网关对 5 个模型的兼容性可能有差异（如不支持 `response_format: json_object`） | 用户已确认能调通；解析失败兜底为 No-op，不会让游戏崩 |
| LLM 输出 JSON 不规范 → 大量 No-op，游戏沉闷 | prompt 模板强约束 + 给出明确 schema；记录 `parse_error` 帮助调优 prompt |
| 单回合内 N agent 并行调 LLM 撞 Ark RPM 限制 | 加 per-provider 简易 rate limiter（最大并发 = 5），超出排队 |
| Next.js Route Handler 的 SSE 长连接在某些 host 上有问题 | MVP 只在本地跑（`npm run dev`），不部署，问题不暴露 |
| Token 烧得用户心疼 | 每回合事件流附 token 用量；UI 顶部累计显示 |

## Out-of-scope follow-ups（写在这里，避免遗忘）
- `add-replay-viewer`：JSONL 加载 + 进度条 + 多 sim 对比
- `add-metrics`：Gini / 联盟图 / persuasion-coercion 分类
- `add-jurisdiction`：第 4.5 阶段裁决 agent
- `add-async-engine`：决策阶段彻底异步化
- `add-provider-fanout`：让 5 把独立 key 真正生效，绕开 Ark 单点
