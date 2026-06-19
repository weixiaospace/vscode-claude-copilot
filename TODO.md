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

## 📅 计划

### 0.3.0 — Path A 凭证迁移：与 claude-copilot-desktop 共享 keychain

依据 [claude-copilot-desktop 设计](docs/superpowers/specs/2026-06-19-claude-copilot-desktop-design.md) §11 §14。

- `src/lib/secrets.ts` 从 `vscode.SecretStorage` 切到 `keytar`（或同等直访 Keychain 的 npm 包）
- 命名约定固定：service = `claude-copilot`，account = 现有 `secretKey()` 返回的字符串（`claude-copilot.provider.<id>.<field>`）—— **保持不变**
- activate 时一次性 migration：检测 `context.secrets.get()` 还能拿到旧值 → 搬到 keytar → 删旧值 → 写 marker (`globalState.migration.secretsToKeytar = true`)
- migration 失败要可观察（toast 提示 + log）
- 跨平台测试：macOS Keychain / Windows Credential Manager / Linux libsecret
- 完成后 desktop 端 v0.1 跟 VSCode 0.3.0 之间凭证自动共享，无需"Import" 命令

## 💡 想法

- **Skill/agent frontmatter inline hooks** —— Phase 4 跳过的源。需要 frontmatter 多行 list 解析。不常用，等用户反馈再补
- **Hooks 面板 add/edit/delete 命令** —— 现在只读。可改成 schema 驱动表单
- **Plugin scope 的 file-resource** —— ADR-0001 显式排除"plugin 提供的同类资源在顶层 tree 重复出现"。如果用户反馈想看，可加 toggle
- **Agents `tools:` block-list 支持** —— 现在 `parseAgentTools` 覆盖了 inline-array、comma-scalar、单值；多行 `- item` block-list 还没覆盖（fallback：tree 不显示 tools 计数，agent 本身仍工作）
- **Closest-wins 嵌套 `.claude/` 扫描** —— CC 2.1.178 monorepo 行为；我们当前只扫每个 scope 的根 `.claude/<resource>/`，按字母序 first-wins。如果有用户在 monorepo 场景反馈不一致，给 file-resource 加 `discovery: 'walk-up'` 变种
- **i18n 死键清理** —— audit 显示 `l10n/bundle.l10n.json` 有 ~191/328 keys 没被引用（中英对称）。多数是 Settings WebView 设计阶段的占位，少数是被重构掉的。0.2.x 集中清一次，bundle 能瘦 ~20KB
- **`McpServer.scope` audit** —— 这次 typecheck 才发现该字段曾是 optional 但所有构造点都填了它；改成 required 已纳入 0.2.0。其他 interface 也可 grep 一遍找类似"声明可选但实际必填"的字段
