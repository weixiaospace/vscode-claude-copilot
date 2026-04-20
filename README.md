<div align="center">

# Claude Copilot

[![Version](https://img.shields.io/badge/version-0.1.15-blue.svg)](https://github.com/weixiaospace/vscode-claude-copilot/releases)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90.0-blue.svg?logo=visual-studio-code)](https://code.visualstudio.com/updates/v1_90)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**[English](README.md) | [中文](README.zh-CN.md)**

</div>

A VS Code extension that provides a visual management interface for [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) configuration. Manage plugins, MCP servers, skills, memory, settings, and usage analytics — all in one unified panel. Works alongside the official Claude Code CLI.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔌 **Plugins & Marketplaces** | Install / uninstall / enable / disable plugins; add or remove custom marketplaces |
| 🧩 **MCP Servers** | Manage user-level (CLI) and project-level (`settings.json`) MCP servers |
| 🪄 **Skills** | Browse `~/.claude/skills` and `.claude/skills`; click to edit `SKILL.md` |
| 🧠 **Memory** | Browse and edit memory files at `~/.claude/projects/<slug>/memory` |
| ⚙️ **Settings** | Visual editor for User / Project / Local three-layer `settings.json` |
| 📊 **Usage Dashboard** | Parse session jsonl; visualize token usage and estimated costs by day, model, and project |

---

## 📸 Screenshots

> **Coming soon** — Screenshots will be added to `docs/screenshots/` before the store release:
> - `overview.png` — Sidebar with 6 panels
> - `plugins.png` — Plugin management
> - `settings.png` — Settings visual editor
> - `usage.png` — Usage dashboard with charts

---

## 🚀 Quick Start

### Install from VS Code Marketplace (Recommended)

Search for **"Claude Copilot"** in the Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`) and click Install.

### Install from VSIX

Download the latest `.vsix` from [Releases](https://github.com/weixiaospace/vscode-claude-copilot/releases) and run:

```bash
code --install-extension claude-copilot-0.1.15.vsix
```

### Setup

1. Make sure [Claude Code CLI](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) is installed (`claude --version`)
2. Open the **Claude Copilot** icon in the Activity Bar
3. Use the **Settings** panel to configure your preferences
4. Add a marketplace in the **Plugins** panel and install plugins
5. Open the **Usage** dashboard to track your token consumption

---

## 📋 Commands

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and type "Claude Copilot":

| Command | Description |
|---------|-------------|
| `Claude Copilot: Refresh All` | Refresh all tree views |
| `Claude Copilot: Open Settings Panel` | Open the visual settings editor |
| `Claude Copilot: Open Usage Dashboard` | Open token usage analytics |
| `Claude Copilot: Browse Marketplace` | Browse available plugins |
| `Claude Copilot: Install Plugin...` | Install a new plugin |
| `Claude Copilot: Create Skill...` | Create a new skill |

---

## 🛠 Development

```bash
# Install dependencies
pnpm install

# Build extension + webview
pnpm build

# Run tests
pnpm test

# Start Extension Development Host
# Press F5 in VS Code

# Package as .vsix
pnpm package
```

---

## 📝 Requirements

- VS Code `^1.90.0`
- [Claude Code CLI](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) installed locally

---

## 🤝 Contributing

Issues and pull requests are welcome! Please visit [GitHub Issues](https://github.com/weixiaospace/vscode-claude-copilot/issues) to report bugs or request features.

---

## 📄 License

[MIT](LICENSE)
