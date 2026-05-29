# 设计：Foundation + Settings 面板重设计

> 日期：2026-05-29 · 分支：feature/provider-manager
> 这是 Phase 2「整体 UI/UX 大胆重设计」拆分后的**第一个**子项目 spec。
> 总体顺序：**Foundation → A(Settings) → B(Provider) → C(Trees) → D(Usage/Marketplace)**，每个子项目独立 spec→计划→实现。
> 本 spec 只覆盖 **Foundation + A**。B/C/D 后续各出独立 spec。

## 背景 / 动机

调研发现：

- 4 个 webview（settings/usage/marketplace/provider）各自把按钮/卡片/徽章/空状态/模态当作原始 Tailwind 字符串复制粘贴，且各自定义了一份 `escapeHtml`。没有共享组件词汇表，「大胆重设计」会变成 4 次重复手调。
- [settings-form.ts](../../../webview-ui/src/settings-form.ts) 是 755 行的命令式「渲染 + 状态 + RPC」混合体，11 个分区平铺为单页长滚动，无搜索、无视觉层级、高级 env 藏在按钮后。这是整个扩展里 UX 收益最大的面。

前置阶段（已完成、已验证）：死代码清理 —— 删除 28 个 orphan l10n key ×2 bundle + 3 处 unused 符号；`pnpm test` 71 passing，`pnpm build` ok。

## 目标

1. 建立共享组件基座 `webview-ui/src/ui.ts`，让所有 webview 的样式语言统一、改一次即全局生效。
2. 把 Settings 面板从单页长滚动重设计为 **左侧分类导航 + 搜索 + scrollspy** 的双栏布局（VSCode 原生设置范式）。
3. 把 Settings 的渲染从命令式重构为 **schema 驱动**，左栏/右栏/搜索/scrollspy 全部由一个声明式 `SECTIONS` 数组推导。

## 非目标（本 spec 不做）

- Provider 切换体验本身（属于子项目 B）。本 spec 只**重新做样式**地保留现有 `settings:setLayerProvider` 行为。
- 改动保存语义、`mergeForSave` / `_raw*` 透传、分层读写（CLAUDE.md 明确这是对的，冻结）。
- 引入任何框架或新增运行时依赖。
- usage/marketplace/provider 面板的功能改动（只是顺带让它们能复用 `ui.ts`，但本 spec 不强制改造它们）。

## 架构

### § 1 Foundation：`webview-ui/src/ui.ts`

一组纯 `(props) → htmlString` 函数，无框架，契合现有 innerHTML 重绘 + 重新绑事件模式。事件绑定仍留在各面板（靠 `data-*` 钩子）。

导出：
- `escapeHtml(s)` —— 唯一实现，替换 usage/marketplace/provider 里的 3 份重复拷贝
- `button({label, variant, size, disabled, attrs})` —— variant `primary | secondary | ghost`，size `sm | md`
- `card(inner, {muted})`、`sectionHeader(title)`、`badge(text, {variant})`
- `field({label, hint, control})` —— label + hint + 控件行
- `toggle`、`switchRow`、`select`、`tagList`、`numberInput` —— 从 settings-form 抽出的设置控件
- `emptyState(text)`、`modal({title, body, footer})`
- 设计 token 常量：`BORDER`(`border-current/20`)、`BORDER_SUBTLE`(`border-current/15`)、`BORDER_FAINT`(`border-current/10`)、`INPUT`、`CARD` 等

单元可测性：纯字符串函数，输入决定输出，可独立理解与（未来）测试。

### § 2 Settings 信息架构（左侧导航双栏）

```
┌──────────┬──────────────────────┐
│ 🔍 Search │ User · ~/.claude  [Prod]│  ← 吸顶上下文栏：层切换 + 生效 provider（只读展示）
├──────────┼──────────────────────┤
│ Permissions│ ## Permissions        │
│ AI        │ …(scrollspy 高亮当前)  │
│ Display   │ ## AI                  │
│ Features  │ …                      │
│ Limits    │                        │
│ Memory    │                        │
│ Files/Git │                        │
│ Plugins   │                        │
│ Advanced  │                        │
├──────────┴──────────────────────┤
│ [Save] [Reset]        [Edit JSON]  │  ← 吸底页脚（行为不变）
└──────────────────────────────────┘
```

- 左栏：顶部搜索框 + 分类列表（带 glyph）。scrollspy 目录：点击滚动到对应分区，滚动时高亮当前分区。
- 右栏：所有分区在同一滚动区。
- 上下文栏：当前层 + 切换器 + 该层生效 provider（沿用现有 `setLayerProvider`，仅重做样式）。
- 页脚：Save / Reset / Edit JSON，行为不变。

### § 3 Settings 架构重构（schema 驱动）

把分区改为声明式数据：

```ts
type Field =
  | { kind:'mode'; key:string; options:string[] }
  | { kind:'tagList'; key:string }
  | { kind:'switch'; key:string }
  | { kind:'select'; key:string; options:{value,label}[] }
  | { kind:'number'; key:string }
  | { kind:'text'; key:string }
  | { kind:'toggleGroup'; key:string; options:string[] }
  | { kind:'pluginList' } | { kind:'customEnv' }   // 特殊分区
type Section = { id:string; label:string; icon:string; fields:Field[] }
const SECTIONS: Section[] = [ … ]
```

左栏、右栏内容、搜索过滤、scrollspy 全部从 `SECTIONS` 推导。

文件拆分：
- `webview-ui/src/settings-schema.ts` —— 声明式 分区/字段 模型（纯数据 + 类型）
- `webview-ui/src/settings-state.ts` —— 表单模型、dirty 跟踪、load/save RPC 封装（语义与现状一致）
- `webview-ui/src/settings-form.ts` —— 渲染编排，消费 `ui.ts` + `SECTIONS` + state

边界：schema 是「有哪些字段、怎么渲染」；state 是「当前值、脏没脏、怎么存」；form 是「把两者拼成 DOM 并绑事件」。改 schema 不影响 state，改 state 不影响 schema。

### § 4 搜索行为

左栏搜索框输入 → 按 field label / key 跨所有分区过滤；左栏只显示有命中的分类；命中字段高亮。空查询 → 完整视图。与 VSCode 原生设置搜索同模型。纯前端过滤，不走 RPC。

## 数据流

不变：`settings:read{layer}` → 填充 state → 用户改动标 dirty → `settings:write{layer, partial}` → 重新 `load()`。层切换、provider 选择走现有 RPC。搜索/scrollspy/导航全在 webview 端，无新增 RPC。

## 错误处理

沿用现状：RPC 失败由 host 端 try/catch + toast。新增的纯前端逻辑（搜索/scrollspy）无 IO，无新增失败面。

## i18n

- 新增的分类标签 / 搜索占位符等 key 同时加到 `l10n/bundle.l10n.json`（英）+ `l10n/bundle.l10n.zh-cn.json`（中）。
- 加到 host 端 `SETTINGS_KEYS` 注入白名单（webview 才拿得到）。
- 复用现有 settings.* key，不重复造。

## 测试策略

- `webview-ui` 当前无单测设施；`ui.ts` 与 `settings-schema.ts` 为纯函数 / 纯数据，靠类型检查兜底。
- 验证：`pnpm build`（vite typecheck + 打包通过）+ 手动 F5 冒烟（左栏导航、搜索、保存、层切换、Edit JSON、各控件读写一遍）。
- 回归：核心 `pnpm test` 71 passing 保持绿色（本 spec 预计不动 `src/core`）。
- bundle 体积监测：settings.js 当前 ~25KB，重构后不应显著膨胀（无新依赖）。

## 风险

- **风险：** schema 抽象覆盖不了 plugins/customEnv 这类特殊分区 →
  **缓解：** 用 `{kind:'pluginList'}` / `{kind:'customEnv'}` 作为「逃生口」字段类型，渲染时分派到专用渲染函数，不强行塞进通用 field。
- **风险：** 重构 755 行可能引入回归 →
  **缓解：** 保存语义与 RPC 协议完全冻结；只动渲染与文件组织；每个控件 F5 手测一遍。
- **风险：** scrollspy 在 webview 里实现复杂 →
  **缓解：** 用 IntersectionObserver；点击导航用 `scrollIntoView`；都是标准 DOM API。

## 验收标准

1. `webview-ui/src/ui.ts` 存在并被 settings 面板使用；3 份重复 `escapeHtml` 收敛为引用 `ui.ts`。
2. Settings 面板呈现左栏分类导航 + 搜索 + scrollspy，右栏所有分区可滚动。
3. settings-form 拆为 schema / state / form 三文件。
4. 所有原有控件功能等价：读、改、保存、重置、层切换、provider 选择、Edit JSON、高级 env。
5. `pnpm build` 通过；`pnpm test` 71 passing；F5 冒烟全过。
6. 新增 l10n key 中英双份齐全且进白名单。
