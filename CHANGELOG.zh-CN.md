# 更新日志

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本规范遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

**[English](CHANGELOG.md) | [中文](CHANGELOG.zh-CN.md)**

## [0.1.17] - 2026-04-22

### 新增

**接入 Profile —— 保存并秒切 API 接入方配置**
- Anthropic / Bedrock / Vertex / Foundry 的多份配置可作为命名 Profile 保存
- **Settings 侧边栏 —— 可展开的 API Provider 组**：显示订阅模式 + 所有已保存的 Profile。当前激活的 Profile 带勾选图标。非激活 Profile hover 时显示 inline 按钮：切换 / 编辑 / 删除。订阅模式只显示切换按钮（无编辑/删除）。组节点本身 hover 显示 "+" 按钮用于新建 Profile
- **Settings WebView —— 可展开的 provider strip**：settings 面板顶部有一个可折叠区块，显示当前激活的 Profile 名称。展开后列出订阅模式 + 所有 Profile，每行带切换/编辑/删除按钮。点击行或切换按钮即可激活，不弹 toast
- 三个入口秒切：状态栏（火箭图标）、Settings 树（可展开组）、Settings WebView（顶部可展开 strip）
- 凭证写入 VSCode SecretStorage（系统 keychain），不再明文落入 `settings.json`
- 自动迁移：首次启动时，`settings.json` 中已有的 provider env 会被转成 "Default" Profile，保留原行为
- 删除激活中的 Profile 会清空相关 env 并回落到订阅模式
- 新增命令：切换接入 Profile、新建接入 Profile、编辑接入 Profile、删除接入 Profile、按 ID 激活 Profile

## [0.1.16] - 2026-04-20

### 新增

**Plugins 面板 —— 可展开树**
- 已安装插件节点现在**可折叠/展开**，展开后能看到该插件提供的 skills / agents / commands / hooks / MCP 声明
- 每个子节点点击后直接打开对应文件（`SKILL.md`、`<name>.md`、`hooks.json`、`.mcp.json` 等）
- 没有任何上述内容的插件保持 `CollapsibleState.None`（不显示三角）

**Settings —— 完全可视化改造**
- 9 大分区，覆盖 ~50 个配置项，基于 [Claude Code 官方文档](https://code.claude.com/docs/en/settings) 精选
- **Provider 切换**：Anthropic / AWS Bedrock / Google Vertex / Microsoft Foundry —— 每个 provider 独立的凭证字段，不会混写
- **鉴权方式切换**（Anthropic 下）：订阅（Claude.ai OAuth）/ API Key / Auth Token / Helper 脚本 —— 切换时旧凭证自动从 env 清除
- 权限分区：`allow` / `ask` / `deny` / `additionalDirectories` tag 列表、`defaultMode` toggle、`disableBypassPermissionsMode`、`skipDangerousModePermissionPrompt`
- 15 个功能开关（DISABLE_TELEMETRY、DISABLE_ERROR_REPORTING、CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 等）全部换成 switch，不再让用户填 env key
- 6 个数值限制输入（MAX_OUTPUT_TOKENS、MAX_THINKING_TOKENS、API_TIMEOUT_MS 等）
- 显示分区：语言 / viewMode / tui / autoUpdatesChannel / reducedMotion / spinnerTipsEnabled / awaySummaryEnabled
- 记忆与梦境分区：autoMemoryEnabled / autoDreamEnabled / autoMemoryDirectory
- API Key 和 Auth Token 输入默认 password 遮罩，带 show/hide 切换
- Tab 下方新增 scope 说明横幅，解释 User / Project / Local 的路径和优先级

**Usage 仪表盘 —— 交互图表**
- 手画 SVG 换成 **Chart.js 4**（jsdelivr CDN 加载，CSP 白名单放行）
- 堆叠柱状图 + 交互 tooltip + 可点 legend
- 按模型输出分布的环形图
- **日 / 周 / 月粒度切换** —— 前端实时聚合
- 周 label 改为真实日期区间（`4/14–4/20`）而不是 ISO week 原始编号
- **按项目统计**表格 + 按输出比例估算的近似成本
- 趋势图叠加**成本折线**（右侧 Y 轴），使用跨模型加权平均的 blended rate
- 6 张概览卡：输入 / 输出 / 缓存读 / 缓存创 / 会话 / 成本
- Anthropic 官方价格表，覆盖 Opus / Sonnet / Haiku 4.x 和 3.5

**Marketplace —— 更新操作**
- marketplace 节点右键 / hover → 更新（调 `claude plugin marketplace update <name>`）
- Marketplaces 组 hover → 全部更新
- marketplace 树节点 description 显示 `updated 2d ago · owner/repo`；tooltip 追加 `X/Y 已安装`
- webview 里装/卸插件成功后显示 VSCode 原生 toast；按钮从缩写 "装/卸" 改为完整"安装/卸载"

**树缓存**
- `SkillsTreeProvider` 和 `MemoryTreeProvider` 首次加载后缓存结果，root 展开时在后台预热 —— 之后展开子节点瞬间命中

**插件元数据**
- 已安装插件扫描除了记录类型，还实际列出 skills / agents / commands 的文件名；hooks 和 MCP 记录文件路径
- 树节点 description 展示 `v1.2.0 · skills · hooks · mcp` 类型标签

**图标**
- 活动栏图标换成自定义齿轮 + 轨道设计（`currentColor` 随主题着色）
- 市集图标单独生成 PNG（256×256）：`resources/marketplace-icon.png`

### 修复

- **Settings CSP 拦截 `window.__l10n` 注入** —— 严格 CSP 下内联脚本被拒，导致 settings 页显示的都是原始 i18n key（如 "settings.title" 而不是 "设置"）。修复：`script-src` 里加 `'nonce-{nonce}'`，内联和 module 脚本都带同一个 nonce。usage 和 marketplace 同步修复
- **Marketplace 安装按钮卡在 "..."** —— 成功分支没清 `state.busy`；改用 try/finally 包
- **Settings 硬编码英文 label** —— "User / Project / Local" 和 "(no workspace)" 是字面量；改为 `t()` 复用 `tree.group.*` / `tree.layer.local`
- **`enabledPlugins` 未管理条目丢失** —— `formToPartial` 只写 form 子集，导致不在 installedPlugins 列表里的条目被清空。修复：`_rawEnabledPlugins` shadow 保留未知条目（同 `_rawPermissions` 策略）
- **顶层 `permissionMode` 遗留 key** —— 早期 UI 写的是非标准的顶层 `permissionMode`，规范写法是 `permissions.defaultMode`。现在 `permissionMode` 加入 knownKeys，保存时自动清掉遗留条目
- **`.vscodeignore` 没排除 `out/*.map`** —— `*.map` 只匹配根目录；改为 `**/*.map`。同时排除 `CLAUDE.md` 和 `TODO.md`。vsix 从 ~60 KB 降到 ~34 KB（本轮加图标和图表前）

### 变更

- `writeLayer` 重构为调用纯函数 `mergeForSave()`（来自 `src/core/settings.ts`），现在有独立单测覆盖
- 所有 panel 统一到 `max-w-5xl` 页面宽度；h1 提升到 `text-2xl`
- `core/settings.ts` 精简到三个 reader + `mergeForSave`（移除了死代码 `mergeSettings`、`writeUser`、`ensureFile`）
- Settings 页底部改为 sticky 保存/重置按钮栏

### 测试

- 35 个 core 层单测（从 29 增加）
- 新覆盖：`mergeForSave` 语义、`_rawPermissions` / `_rawEnabledPlugins` 保留、provider 凭证切换清理、遗留 `permissionMode` 迁移

## [0.1.15] - 2026-04-20

### 变更
- 完善商店发布文件：补充 keywords、homepage、bugs、CHANGELOG、双语 README
- 更新仓库地址为 https://github.com/weixiaospace/vscode-claude-copilot

## [0.1.14] - 2026-04-20

### 新增
- 初始版本发布
- Plugins & Marketplaces 管理面板
- MCP Servers 用户级与项目级管理
- Skills 浏览与编辑
- Memory 文件管理
- Settings 三层可视化编辑（User / Project / Local）
- Usage Dashboard 用量统计与成本估算
- 中英文双语支持

[Unreleased]: https://github.com/weixiaospace/vscode-claude-copilot/compare/v0.1.17...HEAD
[0.1.17]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.17
[0.1.16]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.16
[0.1.15]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.15
[0.1.14]: https://github.com/weixiaospace/vscode-claude-copilot/releases/tag/v0.1.14
