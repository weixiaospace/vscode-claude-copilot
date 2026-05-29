# 设计：Provider 体验打磨（Phase 2 子项目 B）

> 日期：2026-05-29 · 分支：feature/provider-manager
> Phase 2 的第二个子项目。前序：Foundation + A(Settings) 已完成。
> **北极星：简单、易用、逻辑清晰。UI/UX 改善不得增加使用复杂度。** 本 spec 刻意小。

## 背景

provider 子系统当前有多个松散关联的表面（状态栏 quickPick、manager webview、Settings 树、Settings webview 的分层下拉）。用户明确表示**当前侧边栏结构挺好，不要重构、不要新增切换入口/视图**。因此 B 不动结构，只做两件清晰性/安全性打磨，外加清理 provider 区域里确认无用/重复的命令。

## 目标（仅三项）

1. 删除「活动 profile」时给出明确警告 + 删除后 toast（两条删除路径一致）。
2. manager 模态打磨：名称必填（禁用 Save）、凭证「已设置/未设置」明确提示、预设标题清晰化。
3. 简化：删除确认无用的 `providers.activateById`（死命令）与重复的 `providers.create`（等同 `openProviderPanel`）；顺手收敛 delete 命令里重复的 `readProviders`。

## 非目标

- 不动侧边栏 trees、状态栏文案、quickPick 交互、分层覆盖模型（留在 Settings）、任何 provider 切换逻辑。
- 不新增视图 / 命令 / RPC 方法。
- 不动 `providers.edit`（命令面板编辑原始 JSON 的唯一面板级入口，保留）。

## 详细设计

### § 1 删除活动 profile 的警告 + toast

- `src/lib/provider-apply.ts` 的 `deleteProfile(id, secrets)` 改为返回 `Promise<boolean>`（= 删除的是否为当时的活动 profile，即 `wasActive`）。内部逻辑不变，只把已有的 `wasActive` 返回出去。
- `src/commands/providers.ts` 的 `providers.delete`：
  - 确认文案「活动感知」：当 `target.id === doc.active` 时用 `t('providers.delete.confirmActive', name)`（「删除 {0}？它是当前活动接入方——删除将回退到 Subscription。」），否则维持 `providers.delete.confirm`。
  - 删除后若返回 `wasActive` 为真，`showInformationMessage(t('providers.deactivatedAfterDelete', name))`。
  - 顺手：本函数当前读了两次 `readProviders`，收敛为一次。
- `src/webview/provider-panel.ts` 的 `providers:delete` handler：接住 `deleteProfile` 的布尔返回，若为真则 `showInformationMessage(t('providers.deactivatedAfterDelete', name))`（name 由 handler 在删除前从 doc 取）。
- `webview-ui/src/provider-app.ts` 的 `del(p)`：当 `p.id === data.active` 时，确认框用 `t('providers.manage.deleteActiveConfirm', p.name)`，否则维持 `providers.manage.deleteConfirm`。

### § 2 manager 模态打磨（provider-app.ts）

- **名称必填**：Save 按钮在 `form.name.trim()` 为空时 `disabled`。名称 input 的 handler 在更新 `form.name` 的同时，直接切换 `#f-save` 的 `disabled`（不整体 re-render，避免输入失焦）。无额外错误 UI。
- **凭证已设置指示**：渲染 secret 字段时，用 `fieldWrap` 既有的 `hint` 参数显示推导自正在编辑 profile 的标志位的提示：
  - 编辑现有且对应标志为真（anthropic apiKey→`hasApiKey`、authToken→`hasAuthToken`、bedrock→`hasBearerToken`、foundry→`hasApiKey`）→ `t('providers.manage.secretSet')`（「已保存一个凭证——留空保留，输入新值替换。」）
  - 否则 → `t('providers.manage.secretNone')`（「尚未保存凭证。」）
  - 正在编辑的 profile 通过 `data.profiles.find(p => p.id === form.id)` 取得（list 结果已含这些标志位）。secret 输入框 placeholder 简化（不再承担说明职责）。
- **预设标题清晰化**：模态标题从 `⚡ {label}` 改为 `t('providers.manage.newFromPreset', label)`（「从预设新建：{0}」）。既有 `presetHint`（baseURL 固定说明）保留。

### § 3 简化（删除无用/重复命令）

- 删除 `claudeCopilot.providers.activateById`：`src/commands/providers.ts` 注册块（含 `__subscription__` sentinel）、`package.json` `contributes.commands` 条目、`contributes.menus.commandPalette` 里的 `when:false` 条目、`package.nls.json` + `package.nls.zh-cn.json` 的 `cmd.providers.activateById`。（已确认全代码库无 `executeCommand` 调用。）
- 删除 `claudeCopilot.providers.create`：注册块、`package.json` command 条目、两份 nls 的 `cmd.providers.create`。（等同 `openProviderPanel`，后者命令面板已可达。）
- 保留 `providers.edit`、`openProviderPanel`、`quickSwitch`、`delete`。

## i18n

新增 key（中英两份 bundle）：
- `providers.delete.confirmActive`（命令侧；仅 bundle）
- `providers.deactivatedAfterDelete`（命令 + panel host 侧 toast；仅 bundle）
- `providers.manage.deleteActiveConfirm`、`providers.manage.secretSet`、`providers.manage.secretNone`、`providers.manage.newFromPreset`（webview 侧 → 需加入 `provider-panel.ts` 的 `PROVIDER_KEYS` 白名单）

删除 key：`cmd.providers.create`、`cmd.providers.activateById`（两份 package.nls）。

## 错误处理

沿用现状：RPC 失败由 host try/catch；webview confirm() 已在用（del 现有用法）。新增逻辑无新 IO 失败面。

## 测试策略

- `src/lib/provider-apply.ts` 若已有 `deleteProfile` 的单测则补一条断言新返回值；否则不强加 webview 测试设施。
- 验证：`pnpm build` + `pnpm test`（应保持 71 passing，且若加了 deleteProfile 断言则相应增加）+ webview `tsc --noEmit` + 手动 F5（manager 创建/编辑/删除活动 profile/预设；命令面板确认 create/activateById 已消失、edit/openProviderPanel 仍在）。
- l10n 校验：新 webview key 在两份 bundle + `PROVIDER_KEYS`；删除的 nls key 不再被 `package.json` 的 `%...%` 引用。

## 验收标准

1. 删除活动 profile：三处（命令确认、webview 确认、删除后 toast）都明确提示「回退到 Subscription」。
2. manager：名称空时 Save 禁用；secret 字段显示「已设置/未设置」；预设标题为「从预设新建：X」。
3. `providers.activateById`、`providers.create` 命令彻底移除（命令面板搜不到），其余命令与入口不变。
4. `pnpm build` 通过、`pnpm test` 绿、`tsc --noEmit` 干净、F5 冒烟通过；l10n 中英对齐、白名单完整、无悬挂 `%...%` 引用。
