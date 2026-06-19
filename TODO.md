# 项目待办事项

## 🔥 进行中

## ✅ 最近完成

### Provider active-state 撞车修复（0.1.19）

问题：两个 profile 的 baseUrl + authMode 完全相同时，`matchProfileIdByEnv` 只按 env 签名反推，无法区分，切换后 UI 徽章仍停在第一个。修复：给 `matchProfileIdByEnv` 加 `preferId` 参数，用 `providers.json` 里记录的 `active` 做平手裁决；并确保所有切换入口（Provider Manager、Settings 面板 user 层）同步更新 `doc.active`。已加回归测试。长期应改为按层显式存储 active id。

### 已安装插件节点显示类型（0.1.15）

`InstalledPlugin` 新增 `types: PluginType[]`，类型来自 FS 探测：`skills/` / `agents/` / `hooks/` 或 `hooks.json` / `.mcp.json` / `commands/`。tree node 的 `description` 展示 `v{ver} · skills · hooks · mcp` 样式，tooltip 展示完整列表。

### Skills / Memory tree 缓存（0.1.15）

展开面板瞬间显示：Provider 内部缓存 `skills[]` / `memories[]`，首次 `getChildren(root)` 时在后台预热加载，children 请求直接命中缓存。`refresh()` 清缓存后 re-fire。

## 📅 计划

### 0.2.0 — 资源面板扩张（5 phase，单一发版）

依据 [ADR-0001](docs/adr/0001-file-backed-resource-abstraction.md)。在 `feature/resource-expansion` 分支推进，全部完成后合 main + 打 `v0.2.0`。

- **Phase 1 — Agents 面板**（bespoke，作为 harvest 第 2 个实例）
  - `src/core/agents.ts` + `src/tree/agents-tree.ts` + `src/commands/agents.ts`
  - 扫 `~/.claude/agents/**/*.md` + `.claude/agents/**/*.md`，identity = YAML `name`
  - closest-wins 嵌套同名解析
  - tree node 展示 `model · tools · color` frontmatter 摘要
  - 顺带：`enabledPlugins` 字段从 Settings WebView 迁到 Plugins tree（如太复杂可延到 Phase 5）

- **Phase 2 — Harvest 重构**（纯重构，零 user-facing 改动）
  - 抽出 `src/core/file-resource.ts`：descriptor + 通用扫描/解析
  - 抽出 `src/tree/file-resource-tree.ts`：通用 tree provider
  - 把 Skills + Agents 迁移到描述符（~30 LOC each）
  - 35 个 test 必须全绿 + 抽象层新增覆盖
  - `feature/resource-expansion` 在此处的 commit 应能独立 pnpm test 通过

- **Phase 3 — Workflows + Output Styles + Rules**
  - 三个描述符，全部 ride `file-resource`
  - Output Styles 顺带：`outputStyle` 字段从 Settings 迁到自己面板的 "set active" 命令
  - 注意 output-styles `identityFrom: 'filename-or-frontmatter'` 是 4 种 identity 策略里最绕的，先单测覆盖

- **Phase 4 — Hooks 面板**（bespoke，最重的 phase）
  - 5 源合并：user `settings.json` + project `settings.json` + project `settings.local.json` + plugin `hooks/hooks.json` + skill/agent frontmatter inline
  - 按事件名（`PreToolUse` / `PostToolUse` / `InstructionsLoaded` 等）分组，每条带 source 标签
  - hooks 配置从 Settings WebView 删除

- **Phase 5 — Settings 收尾**
  - 盘点剩下的字段，重排分区，确保留下的都是"无对应模块的兜底"
  - 如果 Phase 1/3/4 已清完，本 phase 跳过；否则补完
  - CHANGELOG 4 大块写满，README badge 升 0.2.0

## 💡 想法
