# Proposal: tune-agent-voice

## Why
跑了几局看 chat bubbles 发现一个共性问题：**5 个 LLM 都在写 ChatGPT 邮件腔**。

R1 三条几乎一样的"我想和你结盟，请求 1 点能量，后续会回报"——这是 LLM 默认的"政治正确"输出，**毁掉了游戏的戏剧性**：
- 没有情绪 → 看着累
- 互相群发 → 不像在博弈
- 全是套话 → 模型间没有人格差异
- 啰嗦 → token 烧得快

要让 5 个国产 LLM 在 arena 里好看，必须给它们一个**"如何像真人在聊天框里争资源"**的明确风格指南。

附带：当前 `respond.allocations` 只能转钱不能附言，agent 拒分配 / 给一点 / 全给 都没法说"为什么"。补这个字段后博弈语义会丰富很多——"给你 2 但只这一回""不给，你上次坑了我""半给半留下次再说"都能出来。

## What Changes

### 1. `agent-config` MODIFIED
- `DEFAULT_SHARED_SYSTEM_PROMPT` 加入"说话风格"段，约束 message/reason 的语气和长度
- JSON 响应契约中 `respond.allocations[i]` 新增可选 `reason: string` 字段
- 解析器接受并保留 reason

### 2. `simulation-engine` MODIFIED
- `Allocation` 类型增加 `reason?: string`
- `HistoryEvent.transfer` 增加 `reason?: string`（这样下回合 view 里别人能看到分配理由）
- `round_settled.transfers[i]` 增加 `reason?: string`

### 3. `arena-ui` MODIFIED
- Respond bubble 在 amount 旁显示 reason（如有）
- RoundSettleCard transfer chip 在 hover 时显示 reason（避免横向溢出）

## Scope

### In
- 改 `DEFAULT_SHARED_SYSTEM_PROMPT` 文本
- prompt template 的 JSON schema 描述加 reason 字段说明
- 4 个数据类型的可选字段扩展（向后兼容）
- 2 处 UI 显示 reason
- 解析 + 单测

### Out
- ❌ 把风格规则硬编码进 `buildPrompt`（必须放 DEFAULT，让用户能改/删）
- ❌ 列禁词黑名单（不维护，依赖 LLM 模仿正面范本）
- ❌ 给每个模型不同 system prompt（仍保持模型无关）
- ❌ 用 LLM-judge 给消息打分判断"是否 AI 腔"（phase 2 才考虑）

## Risks
| 风险 | 缓解 |
|---|---|
| 弱模型不遵守，依旧 AI 腔 | 提供 9 条正面范本（少数样本学习的 sweet spot），并加自检指令 |
| reason 字段被模型滥用塞长篇大论 | 风格规则约束 ≤30 字；并且 reason 是可选的，不写更好 |
| 用户改 prompt 时删掉风格段又抱怨 AI 腔 | 在 UI 旁加 hint "默认包含说话风格指引"——本 change 不做，下次 UI 改 |
| 老 JSONL 没 reason 字段 | 解析器和 UI 都把 reason 当 optional 处理，不显示就行 |
