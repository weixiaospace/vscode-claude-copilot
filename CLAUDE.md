# CLAUDE.md

## 项目概述

Claude Copilot —— VSCode 扩展。为 Claude Code CLI 用户提供 plugins / MCP / skills / memory / settings / usage 一站式可视化管理，与官方 Claude Code 插件并存（不抢聊天入口）。

## 常用命令

```bash
pnpm install         # 安装 root + webview-ui 依赖
pnpm build           # esbuild + vite 链式构建（extension + 3 个 webview bundle）
pnpm test            # Mocha + ts-node，35 个 core 层单测
pnpm package         # 产 claude-copilot-<version>.vsix
```

开发调试：在 VSCode 打开此目录 → F5 启动 Extension Development Host。

## 技术栈

**扩展本体**
- TypeScript 5 + Node 18 CJS + esbuild 单文件打包
- VSCode API `^1.90.0`
- Mocha + `assert` 单测（真实 fs 临时目录，零 mock）
- pnpm workspace

**WebView UI** (`webview-ui/`)
- 纯 vanilla TypeScript（**无 React / 无任何运行时框架**）
- Vite 8 多入口构建 → `out/webview/assets/<name>.js`
- Tailwind CSS 4（`@tailwindcss/vite`）
- Usage 面板图表用 **Chart.js 4** via jsdelivr CDN（CSP 白名单放行）

## 架构分层

```
src/
├── core/          纯逻辑，零 vscode 依赖，TDD 覆盖（35 tests）
│   ├── claude-cli.ts   CLI 二进制发现 + execFile 包装
│   ├── settings.ts     三层 settings.json 读取 + mergeForSave 合并
│   ├── skills.ts       SKILL.md 扫描/创建/删除
│   ├── memory.ts       memory 文件扫描 + MEMORY.md 索引维护
│   ├── mcp.ts          MCP server 用户级（CLI）+ 项目级（JSON）
│   ├── plugins.ts      installed_plugins.json 解析 + marketplace 管理 + 类型/子项探测
│   └── usage.ts        session jsonl 聚合（daily/model/project）
│
├── lib/           vscode 相关工具
│   ├── paths.ts        CLAUDE_HOME 常量
│   ├── workspace.ts    currentWorkspace() helper
│   ├── watchers.ts     FileSystemWatcher 注册（auto-refresh）
│   └── l10n.ts         t() helper（vscode.l10n + en bundle fallback）
│
├── tree/          6 个 TreeViewProvider
│   ├── plugins-tree.ts  Marketplaces + Installed（插件可展开看子项）
│   ├── mcp-tree.ts      User + Project MCP server
│   ├── skills-tree.ts   User + Project skill；缓存首次加载结果
│   ├── memory-tree.ts   项目记忆列表；缓存首次加载
│   ├── settings-tree.ts 三层 settings 文件入口
│   └── usage-tree.ts    单一入口打开 usage WebView
├── commands/      4 个 CRUD 命令模块（plugins/mcp/skills/memory）
├── webview/       3 个 WebViewPanel host（usage/marketplace/settings）
│                  每个 panel 注入 nonce + __l10n，CSP 白名单含 jsdelivr（仅 usage）
└── extension.ts   activate() 入口，装配所有 provider/command/watcher

webview-ui/
├── usage.html + src/usage.ts + src/usage-dashboard.ts      Chart.js 图表 + 日/周/月切换
├── marketplace.html + src/marketplace.ts + src/marketplace-browser.ts
├── settings.html + src/settings.ts + src/settings-form.ts  provider 感知的可视化配置
├── src/rpc.ts      postMessage 封装的 RPC
├── src/types.ts    与 extension 端共享的类型
├── src/l10n.ts     t() helper，读 window.__l10n
└── src/index.css   Tailwind @import
```

## 关键设计

- **core/ 必须零 vscode 依赖** —— 可单独 mocha 测试（真实 fs，mkdtemp 隔离）。所有 `vscode.*` 调用只能出现在 `lib/` `tree/` `commands/` `webview/` `extension.ts`。
- **readJsonSafe 只 catch ENOENT** —— 其他错误（parse 失败、EACCES）必须抛出，不能静默吞掉。
- **三层 settings 独立读取，不做自动 merge** —— `settings.ts` 只暴露 `readUser` / `readProjectSettings` / `readLocalSettings` 三个读接口 + `mergeForSave(existing, partial, knownKeys)` 写辅助。settings-panel 分层读写，运行时不 merge，避免 shallow merge 吞掉嵌套键（hooks/mcpServers/env/permissions）。
- **`mergeForSave` 语义**：partial 里的 key 会替换 existing；knownKeys 里但 partial 没写的 key 会被删除（默认值规范化）；未列入 knownKeys 的 key 全部保留（`hooks`/`statusLine`/`sandbox`/自定义等不会被动）。
- **`_rawPermissions` / `_rawEnabledPlugins` shadow** —— 我们只管一部分子字段，其他原样回写，不吞掉用户自己加的或其他工具写入的条目。
- **Provider × authMode 感知写入** —— settings-form 根据 `provider` 和 `authMode` 只写入当前选择对应的 env 变量，切换时旧凭证自动清除。
- **WebView ↔ Extension 通信** —— `postMessage` + `RpcRequest/RpcResponse` 协议（`messaging.ts`）。每个 panel 独立处理 `req.method`。
- **WebView CSP + nonce** —— `<script>window.__l10n = ...</script>` 是内联脚本，CSP 必须带 `'nonce-{nonce}'` 否则被拒；module script 也要带同一个 nonce；`makeNonce()` 在 `src/webview/messaging.ts`。
- **WebView 没有框架** —— 用纯 DOM + innerHTML 重渲染。每次状态变 → `render()` 整段重绘 → 重新绑事件。bundle 小（~5–12 KB）。
- **Tree caching（skills/memory）** —— Provider 内部 `cache` + `inflight`，`getChildren(root)` 触发后台预热，子节点展开时瞬间命中。`refresh()` 清缓存后 fire。
- **文件 auto-refresh** —— `lib/watchers.ts` 用 `createFileSystemWatcher` 监听 `~/.claude/` 关键路径，变化时触发对应 TreeView refresh。

## i18n

VSCode 原生 l10n 的坑：**只自动加载 `bundle.l10n.<locale>.json`（带 locale 后缀），`bundle.l10n.json` 不会被自动当默认 bundle**。因此：

- 不要直接调用 `vscode.l10n.t('key')` —— 英文 locale 下会返回字符串 key 本身
- **一律用 `src/lib/l10n.ts` 的 `t()` helper**，它包了一层：先调 `vscode.l10n.t`，如果返回值 === key（即 locale bundle 没命中），回落到 `bundle.l10n.json`（esbuild 已内联进 extension.js）
- WebView 侧：host 在 HTML 里注入 `<script nonce="...">window.__l10n = {...}</script>`（用 host 端 `t()` 构造，已 fallback 过），webview 用 `webview-ui/src/l10n.ts` 的 `t()` 读

新增字符串：
1. 在 `l10n/bundle.l10n.json`（英文）+ `l10n/bundle.l10n.zh-cn.json`（中文）加 key
2. 代码里用 `t('key')` 或 `t('key', arg1, arg2)`（占位符用 `{0}` `{1}`）
3. WebView 新增 key 要加到对应 panel 的 `USAGE_KEYS` / `MARKETPLACE_KEYS` / `SETTINGS_KEYS` 白名单

`package.json` contributes 里的字符串用 `%key%` 语法，key 去 `package.nls.json` / `package.nls.zh-cn.json` 定义。

## TreeView 视觉一致

每个 TreeView 都遵循 **「chevron + icon + name」** 模式：
- 组节点必须有 `iconPath`（用 ThemeIcon），避免与子节点的 icon 对不齐
- 路径 / workspace 名放 `description` 字段，不拼到 label 里
- `tree.group.*` i18n key 用于组标签

## Plugins 面板特殊点

- 已安装插件节点**可展开**，子项从 `installPath` 下扫出来：
  - `skills/<name>/SKILL.md` → skill 子节点
  - `agents/*.md` → agent 子节点
  - `commands/*.md` → command 子节点
  - `.mcp.json` / `hooks.json` 或 `hooks/` → 单节点
- 没有任何上述内容的插件 `CollapsibleState.None`，不显示三角

## Settings 面板分区

9 大分区，全部控件化，几乎无自由文本输入：
1. **权限** —— defaultMode toggle / allow・ask・deny・additionalDirectories tag 列表 / skipDangerousModePermissionPrompt / disableBypassPermissionsMode
2. **AI 行为** —— 模型 select / effort toggle / alwaysThinkingEnabled / showThinkingSummaries / verbose
3. **接入与鉴权** —— provider toggle（Anthropic / Bedrock / Vertex / Foundry）+ provider-specific 凭证字段
   - Anthropic 下再有 authMode 四选一（订阅 / API Key / Auth Token / Helper 脚本）
4. **功能开关** —— 15 个 `DISABLE_*` / `CLAUDE_CODE_*` / `DISABLE_*` env flag 开关
5. **数值限制** —— 6 个 number input（MAX_OUTPUT_TOKENS 等）
6. **显示与 UI** —— 语言 select / viewMode / tui / autoUpdatesChannel / reducedMotion / spinnerTips / awaySummary
7. **记忆与梦境** —— autoMemoryEnabled / autoDreamEnabled / autoMemoryDirectory
8. **文件、Git 与会话** —— respectGitignore / includeGitInstructions / includeCoAuthoredBy / enableAllProjectMcpServers / cleanupPeriodDays
9. **插件** —— enabledPlugins 复选
10. **高级** —— 自定义 env（默认折叠）

## 文件命名约定

- `kebab-case.ts`（组件、store、hook、工具）
- Test 文件 `<name>.test.ts` 紧挨源文件
- i18n key 点分命名空间（`toast.x`、`dashboard.y`、`settings.z`、`tree.group.*`）

## 打包

- `.vscodeignore` 已排除 `src/`、`node_modules`、`pnpm-lock.yaml`、`webview-ui/src/`、`webview-ui/*.html`、`**/*.map`（注意 `**/` 前缀才能匹配 `out/extension.js.map`）、开发文档 `CLAUDE.md` / `TODO.md` 等
- **必须保留** `!l10n`、`!package.nls.json`、`!package.nls.zh-cn.json`（`!` 前缀覆盖默认排除规则）
- vsix 产物 ~90 KB（22 文件）

## 不做的事

- 聊天会话（官方 Claude Code 插件已覆盖）
- Multi-root workspace（边缘场景，MVP 不支持）
- 可视化 Account/OAuth 面板（走 `claude auth` 更安全）
- Git 面板（与 Claude 无关）
- 引入 React / Svelte / Alpine 等框架（当前 vanilla 规模足够）
