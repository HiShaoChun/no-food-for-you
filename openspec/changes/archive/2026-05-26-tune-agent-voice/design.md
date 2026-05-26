# Design: tune-agent-voice

## D1. 为什么风格规则放 DEFAULT_SHARED_SYSTEM_PROMPT 而不是 buildPrompt

| 选项 | 优点 | 缺点 |
|---|---|---|
| 硬编码进 `buildPrompt()` | 用户无法误删 | 用户**也无法定制**——比如想跑"5 个外交官"局就被强制平民腔 |
| ✅ 放进 `DEFAULT_SHARED_SYSTEM_PROMPT` | 用户能改、能删、能换；UI 里有"恢复默认"按钮 | 用户清空 prompt 后会失效 |

第二种符合 [shared_system_prompt 是用户配置入口] 的原则。第三层防御后续做：UI 加 hint 提醒"删了风格段后 LLM 可能写 AI 腔"。

## D2. 为什么不要黑名单

之前 v1 草稿列了大量禁词（互惠 / 共赢 / 携手 / 共建...）。问题：
- **会快速过时**：新 buzzword 每月在变
- **会误伤**：上下文里"策略性""稳健"有时是精准词
- **本质是 negative prompting**：研究表明 positive prompting（"模仿这个范本"）比 negative prompting（"别说这种词"）对 LLM 更有效

替代：给 **9 条正面范本**覆盖 9 种语气场景：
| 范本 | 场景 |
|---|---|
| "给我 2 点呗，回头还你 3" | 直接讨价 |
| "兄弟你 9 我 3，匀点行不" | 比较型催讨 |
| "诶 R2 你答应过的，别赖账" | 提醒承诺 |
| "别装了，前面是你坑我的" | 揭穿/质问 |
| "我也快没了，自顾不暇" | 卖惨/拒绝 |
| "你不是有挺多嘛，意思一下" | 嫉妒/试探 |
| "凑合给 1 点先撑一回合" | 半给半留 |
| "这把不行了，最后赌一把" | 绝望 |
| "想结盟？先打 1 点定金" | 提条件 |

9 个范本不偏向任何 persona，给 LLM 一个**语气空间**而非"必须这样说"。

## D3. 30 字从硬上限改"通常"

原 v1：硬性 30 字截断。问题：
- "诶 R2 你答应过我的，现在你比我多 3 点都不分？" 比 "给点呗" 戏剧性强 10 倍——但 35 字
- 硬截断会破坏完整的句子语义

改为：**"通常 ≤30 字。超长要'值'——能传情绪 / 揭穿对方 / 提条件，否则就砍"**。引导式而非强制式。

## D4. Allocation.reason 字段设计

```ts
// Before
type Allocation = { to: string; amount: number };

// After
type Allocation = { to: string; amount: number; reason?: string };
```

**可选字段**，原因：
- 老 LLM 输出 / 老 JSONL 没 reason，向后兼容
- 不写 reason 是合法的（"我就转 2 不想解释"也是一种戏剧）
- 模型不强制每次写

### 同步贯穿的 3 个数据点
1. `RespondAction.allocations[].reason` — agent 输出 → 解析到这里
2. `HistoryEvent.transfer.reason` — 写进 view 给下回合 agents 看
3. `round_settled.transfers[].reason` — 写进 SSE 事件给前端展示

3 处都加可选 reason 字段，向后兼容。

### 为什么 HistoryEvent.transfer 也要带 reason
这是**最关键**的设计动作：让下一回合 agent 在 view 里看到"A2 转 3 给 A1，原因：'看你还能撑两轮'"——博弈记忆就能延续。否则 reason 只是 UI 装饰，错过了游戏性提升机会。

## D5. UI 展示策略

### Respond bubble
```
A1 [Allocate]
  → A2: 3  (看你还能撑两轮)
  → A3: 1  (意思下)
```
reason 用小一号字体 + 灰色，跟在 amount 后面。

### RoundSettleCard transfer chip
横向卡片 chip 不能塞太多字，reason 走 `title` (hover tooltip)：
```html
<span class="transfer-chip" title="reason 文字">
  ● A1 → ● A2  3
</span>
```
对鼠标 hover 友好，对手机不友好——MVP 可接受，后续优化。

## D6. Prompt 模板里 reason 的描述写法

JSON schema 例子从：
```json
{"action": "respond", "allocations": [{"to": "<id>", "amount": <正整数>}]}
```
改为：
```json
{"action": "respond", "allocations": [
  {"to": "<id>", "amount": <正整数>, "reason": "<可选, 给/不给的理由, 遵守说话风格>"}
]}
```

只加一行示例，不强制使用，不解释何时该用。

## D7. 不在本 change 做的
- "改了 prompt 删风格段会怎样"的 UI 警告——下次 UI 改
- 不同 persona 模板预设（外交官 / 哑巴 / 江湖）——phase 3
- LLM-judge 评估"AI 腔指数"——phase 2 配合 metrics
- 多语言 prompt——一直推迟
