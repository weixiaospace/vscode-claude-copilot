# 项目待办事项

## 🔥 进行中

## ✅ 最近完成

### Provider active-state 撞车修复（0.1.19）

问题：两个 profile 的 baseUrl + authMode 完全相同时，`matchProfileIdByEnv` 只按 env 签名反推，无法区分，切换后 UI 徽章仍停在第一个。修复：给 `matchProfileIdByEnv` 加 `preferId` 参数，用 `providers.json` 里记录的 `active` 做平手裁决；并确保所有切换入口（Provider Manager、Settings 面板 user 层）同步更新 `doc.active`。已加回归测试。长期应改为按层显式存储 active id。

### 已安装插件节点显示类型（0.1.15）

`InstalledPlugin` 新增 `types: PluginType[]`，类型来自 FS 探测：`skills/` / `agents/` / `hooks/` 或 `hooks.json` / `.mcp.json` / `commands/`。tree node 的 `description` 展示 `v{ver} · skills · hooks · mcp` 样式，tooltip 展示完整列表。

### Skills / Memory tree 缓存（0.1.15）

展开面板瞬间显示：Provider 内部缓存 `skills[]` / `memories[]`，首次 `getChildren(root)` 时在后台预热加载，children 请求直接命中缓存。`refresh()` 清缓存后 re-fire。

## 📅 计划

## 💡 想法
