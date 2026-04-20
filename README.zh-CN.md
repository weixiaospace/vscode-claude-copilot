<div align="center">

# Claude Copilot

[![Version](https://img.shields.io/badge/version-0.1.15-blue.svg)](https://github.com/weixiaospace/vscode-claude-copilot/releases)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90.0-blue.svg?logo=visual-studio-code)](https://code.visualstudio.com/updates/v1_90)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**[English](README.md) | [中文](README.zh-CN.md)**

</div>

VS Code 扩展 —— [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) 配置可视化管理工具。提供 plugins、MCP、skills、memory、settings、usage 一站式面板，与官方 Claude Code CLI 并存使用。

---

## ✨ 功能特性

| 功能 | 说明 |
|---------|-------------|
| 🔌 **插件与市集** | 安装 / 卸载 / 启用 / 禁用插件；添加或移除自定义 marketplace |
| 🧩 **MCP 服务器** | 管理用户级（CLI）和项目级（`settings.json`）MCP 服务器 |
| 🪄 **Skills** | 浏览 `~/.claude/skills` 与 `.claude/skills`；点击即可编辑 `SKILL.md` |
| 🧠 **Memory** | 浏览并编辑 `~/.claude/projects/<slug>/memory` 下的记忆文件 |
| ⚙️ **Settings** | User / Project / Local 三层 `settings.json` 可视化编辑器 |
| 📊 **Usage 仪表盘** | 解析 session jsonl；按日 / 模型 / 项目维度展示 token 用量与估算成本 |

---

## 📸 截图

> **即将补充** —— 商店发布前会在 `docs/screenshots/` 添加以下截图：
> - `overview.png` —— 侧边栏 6 个面板总览
> - `plugins.png` —— 插件管理界面
> - `settings.png` —— Settings 可视化编辑器
> - `usage.png` —— Usage 图表仪表盘

---

## 🚀 快速开始

### 从 VS Code 商店安装（推荐）

在扩展视图（`Cmd+Shift+X` / `Ctrl+Shift+X`）中搜索 **"Claude Copilot"** 并点击安装。

### 手动安装

从 [Releases](https://github.com/weixiaospace/vscode-claude-copilot/releases) 下载最新 `.vsix`，然后执行：

```bash
code --install-extension claude-copilot-0.1.15.vsix
```

### 配置

1. 确保已安装 [Claude Code CLI](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)（`claude --version` 可执行）
2. 点击左侧活动栏的 **Claude Copilot** 图标
3. 在 **Settings** 面板配置偏好设置
4. 在 **Plugins** 面板添加 marketplace 并安装插件
5. 打开 **Usage** 仪表盘查看 token 消耗趋势

---

## 📋 命令

打开命令面板（`Cmd+Shift+P` / `Ctrl+Shift+P`），搜索 "Claude Copilot"：

| 命令 | 说明 |
|---------|-------------|
| `Claude Copilot: Refresh All` | 刷新所有树形视图 |
| `Claude Copilot: Open Settings Panel` | 打开可视化设置编辑器 |
| `Claude Copilot: Open Usage Dashboard` | 打开 token 用量分析 |
| `Claude Copilot: Browse Marketplace` | 浏览可用插件 |
| `Claude Copilot: Install Plugin...` | 安装新插件 |
| `Claude Copilot: Create Skill...` | 创建新 Skill |

---

## 🛠 开发

```bash
# 安装依赖
pnpm install

# 构建扩展 + WebView
pnpm build

# 运行测试
pnpm test

# 启动 Extension Development Host
# 在 VS Code 中按 F5

# 打包为 .vsix
pnpm package
```

---

## 📝 前置依赖

- VS Code `^1.90.0`
- 本地已安装 [Claude Code CLI](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)

---

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！请前往 [GitHub Issues](https://github.com/weixiaospace/vscode-claude-copilot/issues) 反馈问题或建议。

---

## 📄 许可证

[MIT](LICENSE)
