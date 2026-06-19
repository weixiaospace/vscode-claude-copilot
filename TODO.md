# 项目待办事项

## 🔥 进行中

## ✅ 最近完成

### 0.2.0 — 资源面板扩张（5 phase, harvest-after-2）

依据 [ADR-0001](docs/adr/0001-file-backed-resource-abstraction.md)。`feature/resource-expansion` 分支推完，合 main 打 `v0.2.0`。137 个 core 单测全绿。每 phase 一个 commit：

- **Phase 1 — Agents 面板** (`6323d20`) —— bespoke，作为 harvest 第 2 个实例。recursive 扫描、frontmatter `name`/`model`/`tools`/`color`、first-wins 同名去重
- **Phase 2 — file-resource 抽象** (`f2568a6`) —— 抽出 `core/file-resource.ts` + `tree/file-resource-tree.ts` + `commands/file-resource-commands.ts`，Skills + Agents 迁过去。Skills tree 从 72 LOC 缩到 13；Agents tree 73 → 27。零 user-facing 改动
- **Phase 3 — Workflows + Output Styles + Rules** (`8141075`) —— 三个描述符 ride 抽象。Output Styles 带 active selection（读/写 `.claude/settings.local.json#outputStyle`），tree override `loadAll` 并发拉 active，✓ + ⭐ 标记
- **Phase 4 — Hooks 面板** (`4c4c476`) —— bespoke, read-only。4 源合并（user/project/local settings + plugin `hooks/hooks.json`）。按事件分组、source 标签、点击跳源文件。skill/agent inline hooks 延后（不常用）
- **Phase 5 — 收尾 + 0.2.0 发版** —— Settings 清理实际空操作（Plugins WebView 复选框支持分层 enable/disable，Plugins tree 只用户级，保留 WebView 不冗余）；hooks 字段从未在 WebView 渲染；outputStyle 字段从未存在；本 phase 实际只是文档 + CHANGELOG + 版本号

### Provider active-state 撞车修复（0.1.19）

问题：两个 profile 的 baseUrl + authMode 完全相同时，`matchProfileIdByEnv` 只按 env 签名反推，无法区分，切换后 UI 徽章仍停在第一个。修复：给 `matchProfileIdByEnv` 加 `preferId` 参数，用 `providers.json` 里记录的 `active` 做平手裁决；并确保所有切换入口（Provider Manager、Settings 面板 user 层）同步更新 `doc.active`。已加回归测试。长期应改为按层显式存储 active id。

### 已安装插件节点显示类型（0.1.15）

`InstalledPlugin` 新增 `types: PluginType[]`，类型来自 FS 探测：`skills/` / `agents/` / `hooks/` 或 `hooks.json` / `.mcp.json` / `commands/`。tree node 的 `description` 展示 `v{ver} · skills · hooks · mcp` 样式，tooltip 展示完整列表。

### Skills / Memory tree 缓存（0.1.15）

展开面板瞬间显示：Provider 内部缓存 `skills[]` / `memories[]`，首次 `getChildren(root)` 时在后台预热加载，children 请求直接命中缓存。`refresh()` 清缓存后 re-fire。

## 📅 计划

## 💡 想法

- **Skill/agent frontmatter inline hooks** —— Phase 4 跳过的源。需要 frontmatter 多行 list 解析。不常用，等用户反馈再补
- **Hooks 面板 add/edit/delete 命令** —— 现在只读。可改成 schema 驱动表单
- **Plugin scope 的 file-resource** —— ADR-0001 显式排除"plugin 提供的同类资源在顶层 tree 重复出现"。如果用户反馈想看，可加 toggle
