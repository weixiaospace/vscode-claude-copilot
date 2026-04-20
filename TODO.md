# 项目待办事项

## 🔥 进行中

## ✅ 最近完成

### 已安装插件节点显示类型（0.1.15）

`InstalledPlugin` 新增 `types: PluginType[]`，类型来自 FS 探测：`skills/` / `agents/` / `hooks/` 或 `hooks.json` / `.mcp.json` / `commands/`。tree node 的 `description` 展示 `v{ver} · skills · hooks · mcp` 样式，tooltip 展示完整列表。

### Skills / Memory tree 缓存（0.1.15）

展开面板瞬间显示：Provider 内部缓存 `skills[]` / `memories[]`，首次 `getChildren(root)` 时在后台预热加载，children 请求直接命中缓存。`refresh()` 清缓存后 re-fire。

## 📅 计划

## 💡 想法
