# 项目待办事项

## 🔥 进行中

## ✅ 最近完成

## 📅 计划

### 已安装插件节点显示 skills / agents / MCP 信息

**背景**：keyan-studio 的 plugins-panel 用 badge 展示每个已安装插件的 `N 技能`、`N 代理`、`MCP` 标记，信息密度高。我们在死代码清理时移除了 `InstalledPlugin` 的 `skills/agents/hasMcp` 字段和对应 FS 扫描，因为当时无人消费。

**要做**：
- [ ] 恢复 `core/plugins.ts` 里 `listInstalledPlugins` 对 `<installPath>/skills/`、`<installPath>/agents/`、`<installPath>/.mcp.json` 的扫描，以及 `InstalledPlugin` 上的 `skills: string[]`、`agents: string[]`、`hasMcp: boolean`
- [ ] 在 `tree/plugins-tree.ts` 的 `plugin` 节点的 `tooltip` 和/或 `description` 里拼接这些信息（例如 tooltip 追加 `3 skills · 2 agents · MCP`），VSCode TreeItem 没有 React 的 flex badge，要挑一个表达方式

**评估点**：
- `description` 字段如果同时要版本号和这些信息，排版会挤；可能需要只在 tooltip 里写详细信息，description 只保留版本
- 是否值得为此在每次刷新时跑 3×N 次 FS 读？N 通常是个位数，可以忽略

## 💡 想法
