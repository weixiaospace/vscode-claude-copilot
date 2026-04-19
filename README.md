# Claude Copilot

VSCode 扩展 — Claude Code 配置可视化管理工具。提供 plugins、MCP、skills、memory、settings、usage 一站式面板，与官方 Claude Code 插件并存使用。

## 安装

下载最新 `claude-copilot-X.Y.Z.vsix`，运行：

```bash
code --install-extension claude-copilot-X.Y.Z.vsix
```

## 功能

- 🔌 **Plugins & Marketplaces** — 安装/卸载/启用/禁用 plugins，添加/移除 marketplaces
- 🧩 **MCP Servers** — 用户级（CLI）+ 项目级（settings.json）MCP server 管理
- 🪄 **Skills** — 列出 ~/.claude/skills 与 .claude/skills，点击编辑 SKILL.md
- 🧠 **Memory** — 浏览 ~/.claude/projects/<slug>/memory，原生编辑器读写
- ⚙️ **Settings** — User / Project / Local 三层 settings.json 一键打开
- 📊 **Usage Dashboard** — 解析 session jsonl，展示日/模型/项目维度的 token 用量与估算成本

## 前置依赖

需要本机已安装 Claude CLI（`claude --version` 可执行）。

## 手动验证清单

激活扩展后逐项验证：

- [ ] 左侧 Activity Bar 显示 Claude Copilot 图标，点击展开 6 个面板
- [ ] Plugins：可见 Marketplaces / Installed 分组；`+ Install Plugin` 弹出 QuickPick
- [ ] MCP Servers：User / Project (workspace name) 分组渲染；`+ Add` 弹出 transport 选择
- [ ] Skills：User / Project 分组；点击 skill 在编辑器打开 SKILL.md
- [ ] Memory：当前 workspace 对应的 memory 文件列出；点击打开
- [ ] Settings：3 个层节点；点击在编辑器打开（不存在自动创建空 `{}`）
- [ ] Usage：点击 "Open Dashboard" 在 WebView Tab 渲染图表与表格
- [ ] 命令面板搜索 "Claude Copilot" 可见所有顶层命令

## 开发

```bash
pnpm install
pnpm build
# F5 启动 Extension Development Host
pnpm test
pnpm package    # 产物：claude-copilot-X.Y.Z.vsix
```

## License

MIT
