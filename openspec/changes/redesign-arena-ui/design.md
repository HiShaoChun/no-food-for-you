# Design — redesign-arena-ui

## 设计基调

**Modern Dark Arena**：深色基底、低饱和大面积、单一亮色 accent 引导视线、agent 自身用调和过的彩色作为身份标。不卡通、不电竞炫光、不商业 dashboard——目标是"研究者一眼能看明白、看半小时不累眼"。

## 色彩令牌（推荐值）

### 基础面
| token | value | 说明 |
|---|---|---|
| `--bg` | `#0A0D14` | 页面底色，比当前 `#0f1115` 更冷更深，与卡片差异更明显 |
| `--bg-elevated` | `#0D1119` | 顶部 header / footer 底色，与 bg 几乎同色但加细分割线 |
| `--surface` | `#131826` | 卡片/面板默认面 |
| `--surface-2` | `#1A2030` | 输入框、内嵌块（raw text、tooltip） |
| `--surface-hover` | `#1F2638` | hover 态填充 |
| `--border` | `#222A3D` | 默认 1px 边 |
| `--border-strong` | `#2E3854` | 聚焦/强调边 |

### 文字
| token | value | 用途 |
|---|---|---|
| `--text` | `#ECEEF5` | 主体文字、数字 |
| `--text-dim` | `#8B92A5` | 次要标签、辅助说明 |
| `--text-faint` | `#5A6178` | 占位符、空状态 |

### 语义
| token | value | 用途 |
|---|---|---|
| `--accent` | `#7DD3FC` | 主 accent（亮 cyan），Start 按钮高光、聚焦边、活动状态 |
| `--accent-strong` | `#38BDF8` | 渐变深端，按钮渐变底色 |
| `--success` | `#34D399` | provider on、Allocate 气泡 |
| `--danger` | `#F87171` | 淘汰、错误、删除按钮 |
| `--warning` | `#FBBF24` | 暂停 / 警告 |
| `--noop` | `#6B7280` | 无动作中性灰 |

### Agent 调色板（10 色，HSL 等距，亮度归一）
顺序与现有 `--A1..--A10` 对应保持不变，方便已有代码引用：

| | hex | hue |
|---|---|---|
| `--A1` | `#38BDF8` | sky |
| `--A2` | `#FB923C` | orange |
| `--A3` | `#34D399` | emerald |
| `--A4` | `#FACC15` | amber |
| `--A5` | `#A78BFA` | violet |
| `--A6` | `#2DD4BF` | teal |
| `--A7` | `#F472B6` | pink |
| `--A8` | `#A3E635` | lime |
| `--A9` | `#60A5FA` | blue |
| `--A10` | `#FB7185` | rose |

设计依据：全部锁在 HSL 的 L ≈ 60–70 / S ≈ 70–80 区间，避免单一色突兀；色相绕色环大致均匀间隔，相邻可区分；并都能在 `--bg` 上达到 WCAG AA。

## 排版

```
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI",
             "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
--font-mono: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace;

--fs-xs: 11px;   /* meta / divider 标签 */
--fs-sm: 12px;   /* 标签、二级文字 */
--fs-base: 13px; /* 表单 / 气泡正文 */
--fs-md: 14px;   /* 默认 */
--fs-lg: 15px;   /* 段落小标题 */
--fs-xl: 17px;   /* header 品牌名 */
```

数字一律 `font-feature-settings: "tnum" 1;`（等宽数字），尤其用于 energy / token 计数 / round 编号。

## 间距 & 圆角

4px 基础栅格：4 / 8 / 12 / 16 / 20 / 24 / 32。

| token | value |
|---|---|
| `--radius-sm` | 6px (输入框、chip) |
| `--radius-md` | 10px (卡片、按钮) |
| `--radius-lg` | 14px (大面板) |
| `--radius-pill` | 999px |

阴影：MVP 不用大阴影，最多 `0 1px 0 rgba(255,255,255,0.03)` 给卡片一道极细 highlight。

## 布局

```
header     —— 56px sticky
┌──────────┬─────────────────────────┐
│ sidebar  │  chart-wrap   ~ 300px   │
│ 360px    ├─────────────────────────┤
│ scroll-y │  bubbles      1fr       │
│          ├─────────────────────────┤
│          │  footer       44px      │
└──────────┴─────────────────────────┘
```

`page` 由 `grid-template-rows: 56px 1fr` + `grid-template-columns: 360px 1fr` 构成，sidebar 跨整个 1fr 行高，main 内部再分 chart/bubbles/footer 三行。

Header 改为 `position: sticky; top: 0; z-index: 10`，包含：
- 左：品牌徽标（一个 8px 渐变圆点 + `No Food For You · Arena` 文字）
- 中：当前 sim 状态 chip（idle / running / ended）
- 右：5 个 provider pill，配以小圆点 indicator

## 组件层面

### Card
所有"段落"统一升级为 `.card`：背景 `--surface`，圆角 `--radius-md`，1px border，padding `16px`，section heading 用 `.card-title`（uppercase, letter-spacing 1px, `--text-dim`）。

### Agent row
```
[●]  [display_name input]  [model select]  [×]
```
彩色圆 14px，背景取 `--A{idx}` token；切换 model 时圆色不变；移除时回收颜色给后续。

### Bubble
```
┌──────────────────────────────────────┐
│ [●] doubao-seed-code #1  [REQUEST]   │ ← head: avatar(12px) + name + chip
│ → doubao-seed-code #2                │
│ "初始能量均低，希望结盟互助..."        │ ← body
└──────────────────────────────────────┘
```

- 头像彩点用该 agent 的颜色 token
- 动作 chip：
  - REQUEST 用 accent 框（透明底 + accent 边 + accent 字）
  - ALLOCATE 用 success 同款
  - NOOP 用 noop 灰、字号缩小
  - ERROR 用 danger
- bubble 左 3px 高亮条，颜色 = 动作 chip 颜色
- 背景 `--surface`，hover 时 `--surface-hover`
- raw text `<details>` 折叠保留，监控保留

### Round divider
原来两端拉满的 hr 改成居中胶囊：
```
        ╭─── Round 3 ───╮
```
`.round-divider` 用 inline-flex，胶囊 padding `4px 10px`，背景 `--surface-2`，文字 mono、tabular-nums。

### Chart
- `<CartesianGrid>` stroke 改 `--border`，dasharray `4 4`
- X / Y axis tick font `--font-mono`、`--fs-xs`、`--text-dim`
- 自定义 `<Tooltip>`：白底用 surface-2、border、radius-sm、阴影；按 agent 颜色排序，每行一个色点
- `<Line dot={false}>` 改为 `dot={{ r: 2, strokeWidth: 0 }}` 显示节点
- 给每条线加 `strokeOpacity: 0.95`、`strokeWidth: 2.5`
- Legend 项加色点 + display_name

### Start button
- 默认：linear-gradient(135deg, --accent, --accent-strong)，文字 `#04121E`
- hover：filter brightness(1.1)
- focus：0 0 0 3px rgba(125, 211, 252, 0.25) ring
- disabled：背景退到 `--surface-2`、字 `--text-faint`、cursor not-allowed

### Provider pill
- on：`--success` 实心 8px 圆点 + label
- off：`--text-faint` 空心圆 + label dim
- 整体 inline-flex + padding 4px 10px + 1px border + radius-pill

### Scrollbar
统一窄滚动条 `width: 8px`，thumb `--border-strong`，track 透明。

### Focus ring
所有可聚焦元素：`outline: 2px solid --accent; outline-offset: 2px;`，键盘可达。

## 推荐值速查（实现时直接采用）

| 维度 | 推荐 |
|---|---|
| sidebar 宽度 | 360px（当前 380，略瘦） |
| header 高度 | 56px |
| footer 高度 | 44px |
| chart 区高度 | 300px |
| card padding | 16px |
| card 间距 | 14px |
| 输入框高度 | 32px / padding 6px 10px |
| 圆角 | card 10 / chip 999 / input 6 |
| 行高 | 1.55 |
| 表单 label | uppercase 11px letter-spacing 0.6 |

## 替代方案（不采用）

- Tailwind / shadcn：会引入 build chain 改动与依赖膨胀；当前 MVP 体量纯 CSS 完全够
- 玻璃/磨砂：backdrop-filter 在所有 Electron-like 与浏览器上一致性差，放弃
- 浅色主题：MVP 阶段单主题，避免双倍维护

## 截图回归

不在本提案落实自动化视觉回归；改动后人工在 1440×900 上跑一次 3-agent × 6-round 的 sim 截屏作为基线，附在 PR description。
