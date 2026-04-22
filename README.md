<div align="center">

# Claude Copilot

[![Version](https://img.shields.io/badge/version-0.1.17-blue.svg)](https://github.com/weixiaospace/vscode-claude-copilot/releases)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90.0-blue.svg?logo=visual-studio-code)](https://code.visualstudio.com/updates/v1_90)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**[English](README.md) | [中文](README.zh-CN.md)**

</div>

A VS Code extension that provides a visual management interface for [Claude Code](https://docs.claude.com/en/docs/claude-code/overview). Manage plugins, MCP servers, skills, memory, settings, and usage analytics — all in one unified panel. Works alongside the official Claude Code CLI.

<div align="center">
  <img src="docs/screenshots/overview.png" alt="Claude Copilot sidebar overview" width="320" />
</div>

---

## 📸 Screenshots

<table>
  <tr>
    <td width="50%" align="center">
      <a href="docs/screenshots/marketplace.png"><img src="docs/screenshots/marketplace.png" alt="Marketplace browser" /></a>
      <sub><b>Marketplace</b> — browse, search, install plugins</sub>
    </td>
    <td width="50%" align="center">
      <a href="docs/screenshots/settings.png"><img src="docs/screenshots/settings.png" alt="Visual settings editor" /></a>
      <sub><b>Settings</b> — visual editor with provider & auth switching</sub>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <a href="docs/screenshots/usage.png"><img src="docs/screenshots/usage.png" alt="Usage dashboard" /></a>
      <sub><b>Usage Dashboard</b> — interactive Chart.js with day/week/month toggle, per-model doughnut, and cost overlay</sub>
    </td>
  </tr>
</table>

---

## ✨ Features

| Area | What you get |
|---|---|
| 🔌 **Plugins & Marketplaces** | Install / uninstall / enable / disable; add / remove / **update** marketplaces (single or bulk). Installed plugins are **expandable** — click a plugin to see its skills, agents, commands, hooks and MCP declarations; each child opens the underlying file. |
| 🧩 **MCP Servers** | Manage user-level (via CLI) and project-level (`.claude/settings.json`) servers. Separate trees per scope. |
| 🪄 **Skills** | Browse `~/.claude/skills` and `.claude/skills`. Instant expand (cached). Click any skill to edit `SKILL.md`. |
| 🧠 **Memory** | Browse memory files under `~/.claude/projects/<slug>/memory`. Dedicated MEMORY.md index link. |
| ⚙️ **Settings** | Fully visual editor for User / Project / Local. Switches, toggles, selects and tag lists for **~50 settings** — including provider switching (Anthropic / Bedrock / Vertex / Foundry), auth mode switching (Subscription / API Key / Auth Token / Helper script), permissions allow/ask/deny/additionalDirectories, 15 feature flags, 6 numeric limits, memory & dream toggles, and more. Credentials auto-clear on provider/mode switch. **Provider profiles** — save multiple API configs as named profiles, credentials stored in VSCode SecretStorage (OS keychain). Expandable provider group in the sidebar with inline switch/edit/delete buttons. |
| 📊 **Usage Dashboard** | Parses session jsonl. Interactive **Chart.js** stacked bars and doughnut charts. Switch by day / week / month granularity, filter by project, per-model breakdown. Cost estimate uses official Anthropic pricing (Opus / Sonnet / Haiku 4.x and 3.5). |

---

## 🚀 Quick Start

### Install from VS Code Marketplace (Recommended)

Search for **"Claude Copilot"** in the Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`) and click Install.

### Install from VSIX

Download the latest `.vsix` from [Releases](https://github.com/weixiaospace/vscode-claude-copilot/releases):

```bash
code --install-extension claude-copilot-0.1.16.vsix
```

### Setup

1. Install [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/overview) — verify with `claude --version`.
2. Click the **Claude Copilot** icon in the Activity Bar (gear).
3. In the **Plugins** panel, add a marketplace and install plugins; click an installed plugin to inspect its skills/agents/hooks.
4. Open **Settings** → choose scope (User / Project / Local) → configure without touching JSON.
5. Open **Usage** to see token consumption trends and estimated cost.

---

## 📋 Commands

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and type "Claude Copilot":

| Command | Description |
|---|---|
| `Claude Copilot: Refresh All` | Refresh all tree views |
| `Claude Copilot: Open Settings Panel` | Open the visual settings editor |
| `Claude Copilot: Open Usage Dashboard` | Open token usage analytics |
| `Claude Copilot: Browse Marketplace` | Browse available plugins |
| `Switch Provider Profile` | QuickPick to switch between saved profiles or subscription mode |
| `Add Provider Profile... / Edit / Delete` | Manage provider profiles |
| `Install Plugin... / Update / Update All / Add Marketplace...` | Marketplace operations (via tree hover buttons or right-click) |
| `Create Skill... / Delete Skill` | Manage skills |
| `New Memory... / Delete Memory` | Manage memory files |
| `Add User MCP... / Add Project MCP... / Remove MCP Server` | Manage MCP servers |

---

## 🛠 Development

```bash
pnpm install       # install root + webview-ui deps
pnpm build         # esbuild extension + vite webview bundles
pnpm test          # 35 mocha core tests
pnpm package       # vsce package → claude-copilot-<ver>.vsix
```

Press F5 in VS Code to launch the Extension Development Host.

### Project Structure

- `src/core/` — pure logic, zero VS Code imports, fully tested
- `src/tree/` — TreeDataProvider implementations (6 panels)
- `src/commands/` — VS Code command registrations
- `src/webview/` — WebView panel hosts (settings / marketplace / usage)
- `webview-ui/` — Vite-built vanilla TS + Tailwind 4 UI, 3 entry points
- `l10n/` — English + Chinese message bundles
- `resources/` — activity bar icon + marketplace icon

See [CLAUDE.md](CLAUDE.md) for architectural notes and i18n pitfalls.

---

## 📝 Requirements

- VS Code `^1.90.0`
- [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/overview) installed locally

---

## 🤝 Contributing

Issues and pull requests are welcome at [GitHub Issues](https://github.com/weixiaospace/vscode-claude-copilot/issues).

---

## 📄 License

[MIT](LICENSE)
