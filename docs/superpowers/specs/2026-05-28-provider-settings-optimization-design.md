# Provider 接入方设置优化 — 设计文档

日期：2026-05-28
状态：已批准设计，待写实现计划

## 背景

插件已有 Provider Profile 系统（多份 API 接入方配置 + 凭证存 SecretStorage）。当前只支持**全局 / 用户级**：激活 Profile 会把解析后的环境变量写进 `~/.claude/settings.json`，状态栏显示全局 active。

本次优化三个目标（用户确认全做）：

1. **预设 Provider 进创建 UI** —— 像 `KIMI CODE` 这种预设接入方，在 Settings webview 的创建流程里一键添加，用户只填 key。
2. **Provider 区域整体重排** —— Settings webview 里 provider strip / Profile 列表的布局与交互更清晰。
3. **项目级接入选择** —— 让单个项目可以选用某个 Profile，覆盖用户级默认。

## 关键约束

### 凭证明文落盘约束（决定项目级方案）

激活 Profile 时，`profileToPartial` 会从 SecretStorage 读出密钥并**明文**写进目标 settings 文件的 `env`（`ANTHROPIC_AUTH_TOKEN` 等），CLI 才能读到。SecretStorage 是凭证的「保险库 / 真源」，但激活态的密钥会物化进 settings 文件。

因此项目级 pin **必须写 `.claude/settings.local.json`**（Claude Code 约定 gitignore），**绝不能写 `.claude/settings.json`**（会提交进 git → 密钥泄漏）。

### 现有重复逻辑

激活 / 删除的「读 settings → apply → 写文件 + 写 providers.json」逻辑在两处复制粘贴：
- [src/commands/providers.ts](../../../src/commands/providers.ts)（`setActive` / `deleteProfile`）
- [src/webview/settings-panel.ts](../../../src/webview/settings-panel.ts)（`providers:activate` / `providers:delete` RPC）

本次新增项目级 scope 会让分支更多，必须先把文件写入逻辑收敛到 core 共享 helper，命令与 webview 都调用同一处。

### 环境变量分层语义

Claude Code 按 用户级 → 项目级（`.claude/settings.json`）→ 本地级（`.claude/settings.local.json`）合并 env，后者覆盖前者。子层只能**覆盖**父层变量，**无法 unset**。这导致：当用户级已有 Profile 时，无法在项目级「强制回落订阅模式」（没法把父层的 `ANTHROPIC_BASE_URL` 抹掉）。故项目级只做两状态。

## 数据模型（src/core/providers.ts）

### ProvidersFile 扩展

```ts
export interface ProvidersFile {
  version: 1;
  active: string | null;                      // 用户级 active（不变）
  profiles: Profile[];
  projectActive?: Record<string, string>;     // 新增：绝对项目路径 -> profile id
}
```

项目级两状态：
- `projectActive[path]` 存在 → 该项目 pin 到对应 profile id
- key **缺失** → 该项目继承用户级 `active`

（不做 per-project 强制订阅，理由见上「无法 unset」约束 —— YAGNI。）

### 新增纯函数（零 vscode 依赖）

- `effectiveActiveId(doc: ProvidersFile, projectPath: string | null): string | null`
  - 项目路径存在且有 pin → 返回 pin 的 id
  - 否则返回 `doc.active`
- 复用现有纯函数 `applyProfileToSettings(existing, profile, secrets)` 与 `deactivateFromSettings(existing)` —— 它们本就接收任意 settings 对象，可同样用于 `.local`。

`PROVIDER_PRESETS` 注册表已存在（上一步加的 KIMI CODE），本次复用。

## 文件写入收敛（消除重复）

新增一层共享写入 helper，抽到新文件 `src/lib/provider-apply.ts`（vscode-adjacent，命令与 webview 都 import），职责：

- `applyUserActive(id: string | null, secrets)` —— 读 `~/.claude/settings.json`，apply/deactivate，写回；更新 `doc.active`。
- `applyProjectPin(projectPath, id | null, secrets)` ——
  - `id` 非空：读 `.claude/settings.local.json`，`applyProfileToSettings`，写回；`doc.projectActive[path] = id`。
  - `id` 为空（继承）：读 `.local`，`deactivateFromSettings`（剥离 managed env keys），写回；删除 `doc.projectActive[path]`。
- 删除 profile：清 SecretStorage；从 `profiles` 移除；若是某些 scope 的 active，按 scope 回落（用户级 → deactivate user settings；项目级 pin → 从对应项目 `.local` 剥离 + 删 projectActive 条目）。

命令侧与 webview RPC 都改为调用这层 helper。

## Webview 改动

### ProvidersData 扩展（settings-panel `providers:list`）

返回值新增当前项目上下文：
```ts
{
  version, active, profiles,
  projectActive,                 // 整张表
  projectPath: string | null,    // 当前 workspace 绝对路径
  projectName: string | null,    // 展示用
  effectiveId: string | null,    // effectiveActiveId 结果
  projectPinnedId: string | null // 当前项目的 pin（无则 null）
}
```
（无 workspace 时 `projectPath` 为 null，项目级 UI 隐藏或禁用。）

### Provider 区重排（webview-ui/src/settings-form.ts `providerStrip`）

展开后自上而下：
1. **两个 active 摘要行**：`用户默认: <name>` 与 `本项目: <name 或 “继承用户默认”>`，生效的那个打 badge。无 workspace 时只显示用户默认行。
2. **Profile 库列表**：每行 `● name (kind)` + 按钮。「切换」按钮带 scope 选择：
   - 设为用户默认
   - 固定到本项目（无 workspace 时禁用）
   - 编辑 / 删除
3. **创建区**：
   - **预设快加**：一排预设按钮（首个 `KIMI CODE`），点击 → 内联 mini-form（名称预填 preset.label + 单个 key 输入 + 确认/取消）。
   - 「+ 新建 Profile」（走现有命令 quick-pick，含完整四种 provider + 预设）
   - 「打开 providers.json」

### 新增 RPC（settings-panel.ts）

- `providers:activate` 改签名：`{ id: string | null, scope: 'user' | 'project' }`，分别调 `applyUserActive` / `applyProjectPin`。
- `providers:createFromPreset` —— `{ presetId, name, key }`：按 preset 建 anthropic profile（authMode / baseUrl / credentialField 来自 preset），key 存 SecretStorage，profile 入库。**不自动激活** —— 仅加入 Profile 库，由用户随后用 scope 选择激活（行为可预期、不惊吓）。
- `providers:list` 返回扩展后的 ProvidersData。

## 状态栏（src/lib/status-bar.ts）

显示**当前项目的生效 Profile**（用 `effectiveActiveId(doc, currentWorkspace())`），并标注来源（项目 pin / 用户默认 / 订阅）。

## i18n

新增 key（`l10n/bundle.l10n.json` + `.zh-cn.json`，webview 还要进 `SETTINGS_KEYS` 白名单）：
- `providers.scope.user` / `providers.scope.project`
- `providers.webview.userDefault` / `providers.webview.thisProject` / `providers.webview.inherit`
- `providers.webview.effective`（badge）
- `providers.webview.quickAdd`（预设快加标题）
- `providers.preset.create.name` / `providers.preset.create.confirm` / `providers.preset.create.cancel`
- `providers.pinned` / `providers.unpinned`（toast）

（`providers.create.presetKey` / `providers.create.customGroup` 已加。）

## 测试

core 层（真实 fs + mkdtemp，零 mock，沿用现有风格）：
- `effectiveActiveId`：无 pin 回落 user active；有 pin 返回 pin；无 projectPath 回落 user active。
- `applyProjectPin` 语义：pin 写入 .local 的 env 含 baseUrl + 物化密钥；继承时剥离 managed keys；不动 .local 里非 managed 的键（沿用 mergeForSave 语义）。
- 删除 active profile（用户级 / 项目级）后对应文件被正确 deactivate。

不写 webview / vscode 层单测（项目约定 core 才有单测）。

## 范围之外（YAGNI）

- per-project 强制订阅模式（env 无法 unset 父层变量）。
- 把项目级选择拆成独立 webview（用户已否决，留在 Settings 页面）。
- 项目级 Profile 写进可提交的 `.claude/settings.json`（密钥泄漏风险）。
- 把非密钥部分与密钥拆分到不同层的复杂写入。
- 多 root workspace（项目既有约定不支持）。

## 验证

- `pnpm build` 通过；`pnpm test` 全绿（含新增 core 单测）。
- 手动：在有 workspace 的 Extension Dev Host 里，建 KIMI CODE 预设 → 设为用户默认 → 再固定到本项目某个别的 Profile → 确认 `.claude/settings.local.json` 写入正确、状态栏显示项目生效 Profile、取消固定后回落用户默认。
