# Provider 接入方设置优化 — 设计文档（v2）

日期：2026-05-28（v2 重写）
状态：已批准方向，待用户 review spec → writing-plans

## 背景与目标

插件已有 Provider Profile 系统（多份 API 接入方 + 凭证存 SecretStorage）。经几轮讨论，确定**关注点分离**的架构：

- **管理在一处**：新建一个**独立的 Provider 管理 webview**，作为维护 Profile 的唯一入口（增删改查 + 预设 + 凭证 + 设为用户默认）。
- **选用在 Settings**：Settings 页面只留一个轻量「本层启用哪个 Provider」的选择器。

配合之前已落地的「Settings 按层（user/project/local）打开」修复，选择器**跟着层走**，项目级接入自然得出。

## 已确定的决策（讨论结论）

1. 独立 Provider 管理 webview，**点侧栏 🚀 API Provider 节点打开**。
2. 侧栏 API Provider 节点简化为**单个叶子节点** `API Provider · <生效名>`，点击开 webui；移除原来内联的 subscription / profile-item 子节点和行内切换按钮。
3. Settings 选择器**跟当前层走**：在哪个层打开 Settings，选择器就把 Profile 的 env 物化进哪个层的 settings 文件。
4. **三层一视同仁，project 层不禁用**。用户明确表示：写进会提交的 `.claude/settings.json` 导致密钥进 git 由用户自负，插件不做拦截。
5. webui **可「设为用户默认」**（等价于 user 层激活）；项目/本地覆盖走 Settings 分层选择器。
6. 预设（KIMI CODE 等）在 webui 创建流程里一键添加，只填 key。

## 数据模型

### providers.json — 基本不动

沿用现有 `{ version, active, profiles[] }`：
- `active`：**用户默认** Profile id（webui「设为用户默认」写它；状态栏 fallback / 侧栏标签用它）。
- `profiles`：Profile 库。

**不引入** `projectActive` / `scopes` 指针表。某层「当前选了哪个 Profile」一律由该层 settings 文件的 `env` 反查得出（见下）。`providers.json` 是「库 + 用户默认」的真源；各层 settings 文件的 env 是「该层选用什么」的真源。

### 新增纯函数（src/core/providers.ts，零 vscode）

```ts
// 给定一份 settings 的 env（及 apiKeyHelper），在 profiles 里反查签名匹配的 Profile id。
// 匹配维度：kind + baseUrl + 鉴权方式标记（不比对密钥明文）。
// 无 managed provider env -> null（= 该层未设置 / 订阅）。
// 多个候选签名相同 -> 返回首个匹配（罕见，可接受）。
export function matchProfileIdByEnv(
  settings: Record<string, unknown>,
  profiles: Profile[],
): string | null
```

复用现有 `detectLegacyProfile` 的签名判定思路（USE_BEDROCK/VERTEX/FOUNDRY 标记、ANTHROPIC_API_KEY vs AUTH_TOKEN vs apiKeyHelper、baseUrl 等），抽成可被两者共享的内部判定。

`PROVIDER_PRESETS`（含 KIMI CODE）已存在，webui 创建流程复用。

`applyProfileToSettings(existing, profile, secrets)` / `deactivateFromSettings(existing)` 已是纯函数、接收任意 settings 对象，三层通用，直接复用。

## 文件写入收敛（消除重复）

现状：激活/删除的「读 settings → apply → 写文件 + 写 providers.json」在 [commands/providers.ts](../../../src/commands/providers.ts) 与 [webview/settings-panel.ts](../../../src/webview/settings-panel.ts) 重复。新增独立 webui 会再多一处调用方，必须先收敛。

新建 `src/lib/provider-apply.ts`（vscode-adjacent，命令 / settings-panel / provider-panel 共用），导出：
- `applyToLayer(layer: Layer, profileId: string | null, secrets): Promise<void>`
  —— 读该层 settings，`profileId` 非空则 `applyProfileToSettings`，为空则 `deactivateFromSettings`，写回该层文件。layer→路径用 `userSettingsPath` / `projectSettingsPath(ws)` / `localSettingsPath(ws)`。
- `setUserDefault(profileId: string | null, secrets): Promise<void>`
  —— `applyToLayer('user', id, secrets)` + 更新 `providers.json.active = id`。
- `deleteProfile(id, secrets): Promise<void>`
  —— 清 SecretStorage 各字段；从 `profiles` 移除；若它是 `active` 则置 null 并 `deactivateFromSettings` user 层；写 providers.json。（不主动清理 project/local 层残留 env —— 那是该层显式选择，留给用户/分层选择器处理；删除时给 toast 提示即可。）
- `effectiveProfileId(secrets?): Promise<string | null>`
  —— 读 user/project/local 三层（无 ws 时只 user），按 local>project>user 合并 managed env，`matchProfileIdByEnv` 反查；用于状态栏 / 侧栏标签。

命令侧与两个 webview 的 RPC 都改调这层。

## 独立 Provider 管理 webview（新）

### Host：src/webview/provider-panel.ts

仿 settings-panel.ts：单例 panel、nonce + CSP、注入 `window.__l10n`、postMessage RPC。入口 `openProviderPanel(context)`。

RPC 方法：
- `providers:list` → `{ active, profiles, presets, effectiveId }`（`presets` 来自 `PROVIDER_PRESETS`，供快加按钮）。
- `providers:createFromPreset` `{ presetId, name, key }` → 建 anthropic profile（authMode/baseUrl/credentialField 来自 preset），key 存 SecretStorage，入库。不自动激活。
- `providers:create` `{ profile-fields..., secret }` → 通用新建（四种 kind 全字段表单）。
- `providers:update` `{ id, fields..., secret? }` → 编辑（secret 为空表示不改凭证）。
- `providers:delete` `{ id }` → 调 `deleteProfile`。
- `providers:setDefault` `{ id | null }` → 调 `setUserDefault`（webui 内激活用户默认）。
- `providers:openJson` → 打开 providers.json。

### Webview UI：webview-ui/src/provider.{html,ts} + provider-app.ts（vanilla + Tailwind）

- 顶部：预设快加按钮行（KIMI CODE …）→ 点击内联 mini-form（名称预填 + 单 key）→ createFromPreset。
- Profile 库列表：每行 `name (kind)` + 「设为用户默认」（当前默认打 badge）/ 编辑 / 删除。
- 「+ 新建 Profile（高级）」→ 完整表单（四种 provider，沿用 settings-form 里的 provider 字段渲染逻辑，可抽共享）。
- 「打开 providers.json」。
- 新增 vite 入口（多入口 build：usage / marketplace / settings / **provider**）。
- i18n key 走新 `PROVIDER_KEYS` 白名单注入。

## 侧栏改动（src/tree/settings-tree.ts）

- `profile-group` 节点：`CollapsibleState.None`，label `API Provider · <生效名>`，`item.command = openProviderPanel`。
- 移除 `profile-subscription` / `profile-item` 子节点与其 `getChildren` 分支。
- 生效名用 `effectiveProfileId()` 解析（无 ws 时即用户默认）。
- package.json 里原行内切换相关的 view/item context menu（若有）随之清理；保留命令本身（状态栏 quickSwitch 仍用）。

## Settings 页面改动（webview-ui/src/settings-form.ts）

- 顶部（layer 徽章下方）新增「本层启用的 Provider」`<select>`：选项 = `未设置/订阅` + 库里所有 Profile。
- 当前值：扩展 `settings:read` 的返回，附带 `profiles`（id+name+kind 摘要）和 `activeProfileId`（= 对当前层 settings 跑 `matchProfileIdByEnv` 的结果）。webview 不新增 RPC。
- onChange：新增 RPC `settings:setLayerProvider { layer, id|null }`（内部走 `applyToLayer`），然后 reload。
- **三层都启用**，不对 project 层做特殊禁用（决策 4）。仅在 project 层显示一行 hint：「此层会提交进 git，凭证将随之入库」。
- 移除现有 `providerStrip`（管理已搬到独立 webui）。Settings 不再做 Profile 的增删改。

## 状态栏（src/lib/status-bar.ts）

显示 `effectiveProfileId()` 解析出的生效 Profile 名（无匹配 → 订阅）。点击保持现状触发 quickSwitch（作用于用户默认）。

## i18n

新增 key（en + zh-cn；webview 进对应白名单）：
- 侧栏/通用：`providers.webview.title`（管理 webui 标题）、`providers.openManager`
- 管理 webui：`providers.manage.library`、`providers.manage.setDefault`、`providers.manage.default`(badge)、`providers.manage.newAdvanced`、`providers.manage.quickAdd`、编辑/删除确认等
- Settings 选择器：`settings.activeProvider`、`settings.activeProvider.none`、`settings.activeProvider.projectHint`
- 预设：`providers.create.presetKey` / `providers.create.customGroup`（已加）

## 测试（core 层，真实 fs + mkdtemp，零 mock）

- `matchProfileIdByEnv`：
  - anthropic apiKey / authToken / helper / baseUrl 各自匹配正确
  - bedrock/vertex/foundry 按 USE_* 标记匹配
  - 无 managed env → null
  - 签名相同多候选 → 返回首个
- `applyToLayer` 经由现有 `applyProfileToSettings`/`deactivateFromSettings`（这俩已有/可补单测）：写入含 baseUrl + 物化密钥；deactivate 剥离 managed keys；不动非 managed 键（mergeForSave 语义）。
- `setUserDefault`：更新 active + 写 user settings。
- `deleteProfile`：清 secret、移除 profile、若是 active 则 user 层 deactivate。

webview / vscode 层不写单测（项目约定）。

## 范围之外（YAGNI）

- per-project 强制订阅（env 无法 unset 父层；但本设计三层各自写文件，已能在某层显式选「订阅/未设置」剥离本层 managed env）。
- 给 project 层加密钥拦截 / 警告弹窗（决策 4：用户自负）。
- `projectActive` / `scopes` 指针表（改用 env 反查）。
- 多 root workspace（既有约定不支持）。

## 验证

- `pnpm build` 通过；`pnpm test` 全绿（含新增 core 单测）。
- `pnpm package` 产物干净（不含 .playwright-mcp 等开发副产物）。
- 手动（Extension Dev Host，有 workspace）：
  1. 点侧栏 API Provider → 开管理 webui → 预设快加 KIMI CODE（只填 key）→ 库里出现。
  2. webui 里「设为用户默认」→ ~/.claude/settings.json 写入、状态栏更新。
  3. 侧栏 Local 层打开 Settings → 选另一个 Profile → `.claude/settings.local.json` 写入 → 状态栏生效名变为该 Profile。
  4. Local 层选「未设置」→ 剥离本层 managed env → 回落用户默认。
  5. project 层选 Profile → 写进 `.claude/settings.json`（验证不被拦截，仅 hint）。
