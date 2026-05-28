# Provider 管理 webUI + 分层选择器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Provider 接入方的「管理」搬进一个独立的 webview（增删改查 + 预设快加 + 激活），Settings 页面只保留一个「本层启用哪个 Provider」的分层选择器。

**Architecture:** 纯逻辑 `matchProfileIdByEnv` 进 `src/core/providers.ts`（TDD）；文件写入收敛进新 `src/lib/provider-apply.ts`；新增 `src/webview/provider-panel.ts` + `webview-ui/src/provider-app.ts` 一个独立面板；侧栏 API Provider 节点变叶子点击打开它；Settings webview 去掉 providerStrip、加分层 `<select>`。「某层选了谁」一律读该层 env 反查，不引入指针表。

**Tech Stack:** TypeScript 5 + esbuild（扩展）、Vite 8 多入口 + Tailwind 4 + vanilla TS（webview）、Mocha + assert（core 单测，真实 fs）。

参考 spec：`docs/superpowers/specs/2026-05-28-provider-settings-optimization-design.md`

---

## File Structure

**Create:**
- `src/lib/provider-apply.ts` — 分层 apply / 激活 / 删除 / 生效解析（命令 + 两个 panel 共用）
- `src/webview/provider-panel.ts` — 独立 Provider 管理面板 host + RPC
- `webview-ui/provider.html` — 面板入口 HTML
- `webview-ui/src/provider.ts` — 挂载入口
- `webview-ui/src/provider-app.ts` — 管理 UI（vanilla DOM 重渲染）

**Modify:**
- `src/core/providers.ts` — 新增 `matchProfileIdByEnv`
- `src/core/providers.test.ts` — 新增测试
- `src/commands/providers.ts` — 改用 provider-apply（去重）
- `src/lib/status-bar.ts` — 用 `effectiveProfileId`
- `src/tree/settings-tree.ts` — profile-group 变叶子，移除 profile 子节点
- `src/webview/settings-panel.ts` — settings:read 附带 profiles/activeProfileId；新增 settings:setLayerProvider；移除 providers:activate/delete
- `webview-ui/src/settings-form.ts` — 移除 providerStrip，加分层选择器
- `webview-ui/vite.config.ts` — 加 provider 入口
- `src/extension.ts` — 注册 openProviderPanel + watcher 刷新
- `l10n/bundle.l10n.json` + `l10n/bundle.l10n.zh-cn.json` — 新 key

---

## Task 1: 核心 `matchProfileIdByEnv` + 测试

**Files:**
- Modify: `src/core/providers.ts`
- Test: `src/core/providers.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/core/providers.test.ts` 末尾追加：

```ts
import { matchProfileIdByEnv } from './providers';

describe('matchProfileIdByEnv', () => {
  const profiles: Profile[] = [
    { id: 'off', name: 'Official', kind: 'anthropic', authMode: 'subscription' },
    { id: 'kimi', name: 'KIMI', kind: 'anthropic', authMode: 'authToken', baseUrl: 'https://api.kimi.com/coding/', hasAuthToken: true },
    { id: 'key', name: 'KeyProxy', kind: 'anthropic', authMode: 'apiKey', baseUrl: 'https://proxy/', hasApiKey: true },
    { id: 'bed', name: 'Bed', kind: 'bedrock', baseUrl: 'https://b/' },
  ];

  it('returns null when no managed provider env present', () => {
    assert.equal(matchProfileIdByEnv({ env: {} }, profiles), null);
    assert.equal(matchProfileIdByEnv({}, profiles), null);
  });

  it('matches anthropic authToken + baseUrl', () => {
    const env = { ANTHROPIC_AUTH_TOKEN: 'x', ANTHROPIC_BASE_URL: 'https://api.kimi.com/coding/' };
    assert.equal(matchProfileIdByEnv({ env }, profiles), 'kimi');
  });

  it('matches anthropic apiKey + baseUrl', () => {
    const env = { ANTHROPIC_API_KEY: 'x', ANTHROPIC_BASE_URL: 'https://proxy/' };
    assert.equal(matchProfileIdByEnv({ env }, profiles), 'key');
  });

  it('does not match apiKey profile when only authToken present', () => {
    const env = { ANTHROPIC_AUTH_TOKEN: 'x', ANTHROPIC_BASE_URL: 'https://proxy/' };
    assert.equal(matchProfileIdByEnv({ env }, profiles), null);
  });

  it('matches bedrock by USE flag + base url', () => {
    const env = { CLAUDE_CODE_USE_BEDROCK: '1', ANTHROPIC_BEDROCK_BASE_URL: 'https://b/' };
    assert.equal(matchProfileIdByEnv({ env }, profiles), 'bed');
  });

  it('never matches a subscription-mode profile (no signature)', () => {
    assert.equal(matchProfileIdByEnv({ env: {} }, profiles), null);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test 2>&1 | grep -A2 matchProfileIdByEnv`
Expected: FAIL —「matchProfileIdByEnv is not a function」/ 导入报错。

- [ ] **Step 3: 实现**

在 `src/core/providers.ts` 末尾（`deactivateFromSettings` 之后）追加：

```ts
function profileMatchesEnv(p: Profile, env: Record<string, string>, helper: string): boolean {
  const usesCloud = env.CLAUDE_CODE_USE_BEDROCK === '1'
    || env.CLAUDE_CODE_USE_VERTEX === '1'
    || env.CLAUDE_CODE_USE_FOUNDRY === '1';
  const eq = (a?: string, b?: string) => (a || '') === (b || '');

  if (p.kind === 'anthropic') {
    if (usesCloud) return false;
    if (!eq(p.baseUrl, env.ANTHROPIC_BASE_URL)) return false;
    if (p.authMode === 'apiKey') return !!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN && !helper;
    if (p.authMode === 'authToken') return !!env.ANTHROPIC_AUTH_TOKEN && !env.ANTHROPIC_API_KEY && !helper;
    if (p.authMode === 'helper') return !!helper && eq(p.apiKeyHelper, helper);
    return false; // subscription 无签名，不参与匹配
  }
  if (p.kind === 'bedrock') {
    return env.CLAUDE_CODE_USE_BEDROCK === '1' && eq(p.baseUrl, env.ANTHROPIC_BEDROCK_BASE_URL);
  }
  if (p.kind === 'vertex') {
    return env.CLAUDE_CODE_USE_VERTEX === '1' && eq(p.projectId, env.ANTHROPIC_VERTEX_PROJECT_ID);
  }
  if (p.kind === 'foundry') {
    return env.CLAUDE_CODE_USE_FOUNDRY === '1' && eq(p.resource, env.ANTHROPIC_FOUNDRY_RESOURCE);
  }
  return false;
}

/**
 * 给定一份 settings（env + apiKeyHelper），在 profiles 里反查签名匹配的 Profile id。
 * 不比对密钥明文；无 managed provider env → null；多候选签名相同 → 返回首个。
 */
export function matchProfileIdByEnv(
  settings: Record<string, unknown>,
  profiles: Profile[],
): string | null {
  const env = (settings.env ?? {}) as Record<string, string>;
  const helper = typeof settings.apiKeyHelper === 'string' ? settings.apiKeyHelper : '';
  for (const p of profiles) {
    if (profileMatchesEnv(p, env, helper)) return p.id;
  }
  return null;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test`
Expected: PASS，全部 core 测试绿（原有 + 新增 6 条）。

- [ ] **Step 5: 提交**

```bash
git add src/core/providers.ts src/core/providers.test.ts
git commit -m "feat(providers): matchProfileIdByEnv — resolve active profile from a layer's env"
```

---

## Task 2: `src/lib/provider-apply.ts` 共享写入层

**Files:**
- Create: `src/lib/provider-apply.ts`

> 该文件依赖 `currentWorkspace`（vscode），故不做 mocha 单测（项目约定 lib/ 不测）；它只是把已测的 core 纯函数串起来 + 文件 IO。

- [ ] **Step 1: 创建文件**

```ts
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  readProviders, writeProviders, secretKey,
  applyProfileToSettings, deactivateFromSettings, matchProfileIdByEnv,
  type SecretsGateway,
} from '../core/providers';
import {
  readUser, readProjectSettings, readLocalSettings,
  userSettingsPath, projectSettingsPath, localSettingsPath,
} from '../core/settings';
import { CLAUDE_HOME } from './paths';
import { currentWorkspace } from './workspace';

export type Layer = 'user' | 'project' | 'local';

async function writeFileJson(p: string, next: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(next, null, 2) + '\n', 'utf-8');
}

function layerPath(layer: Layer): string | null {
  if (layer === 'user') return userSettingsPath(CLAUDE_HOME);
  const ws = currentWorkspace();
  if (!ws) return null;
  return layer === 'project' ? projectSettingsPath(ws.fsPath) : localSettingsPath(ws.fsPath);
}

async function readLayer(layer: Layer): Promise<Record<string, unknown>> {
  if (layer === 'user') return (await readUser(CLAUDE_HOME)) as Record<string, unknown>;
  const ws = currentWorkspace();
  if (!ws) return {};
  return (layer === 'project'
    ? await readProjectSettings(ws.fsPath)
    : await readLocalSettings(ws.fsPath)) as Record<string, unknown>;
}

/** 把某 Profile 的 env 物化进指定层的 settings 文件；profileId 为 null 则剥离 managed env。 */
export async function applyToLayer(layer: Layer, profileId: string | null, secrets: SecretsGateway): Promise<void> {
  const p = layerPath(layer);
  if (!p) return;
  const existing = await readLayer(layer);
  const doc = await readProviders(CLAUDE_HOME);
  const profile = profileId ? doc.profiles.find(x => x.id === profileId) : undefined;
  const next = profile
    ? await applyProfileToSettings(existing, profile, secrets)
    : deactivateFromSettings(existing);
  await writeFileJson(p, next as Record<string, unknown>);
}

/** 激活（基线生效）：写 user 层 + 更新 providers.json.active。 */
export async function activateProfile(profileId: string | null, secrets: SecretsGateway): Promise<void> {
  await applyToLayer('user', profileId, secrets);
  const doc = await readProviders(CLAUDE_HOME);
  doc.active = profileId;
  await writeProviders(CLAUDE_HOME, doc);
}

/** 删除 Profile：清凭证 + 出库；若它是 active，则置 null 并剥离 user 层 env。 */
export async function deleteProfile(id: string, secrets: SecretsGateway): Promise<void> {
  const doc = await readProviders(CLAUDE_HOME);
  if (!doc.profiles.some(p => p.id === id)) return;
  for (const field of ['apiKey', 'authToken', 'bedrockToken', 'foundryApiKey']) {
    await secrets.delete(secretKey(id, field));
  }
  doc.profiles = doc.profiles.filter(p => p.id !== id);
  const wasActive = doc.active === id;
  if (wasActive) doc.active = null;
  await writeProviders(CLAUDE_HOME, doc);
  if (wasActive) await applyToLayer('user', null, secrets);
}

/** 状态栏/侧栏用：合并三层 managed env 反查生效 Profile id（无匹配回落 active）。 */
export async function effectiveProfileId(): Promise<string | null> {
  const doc = await readProviders(CLAUDE_HOME);
  const user = await readLayer('user');
  let env: Record<string, string> = { ...((user.env ?? {}) as Record<string, string>) };
  let helper = (user as any).apiKeyHelper as string | undefined;
  if (currentWorkspace()) {
    const proj = await readLayer('project');
    const local = await readLayer('local');
    env = { ...env, ...((proj.env ?? {}) as Record<string, string>), ...((local.env ?? {}) as Record<string, string>) };
    helper = (local as any).apiKeyHelper ?? (proj as any).apiKeyHelper ?? helper;
  }
  const matched = matchProfileIdByEnv({ env, apiKeyHelper: helper }, doc.profiles);
  return matched ?? doc.active;
}
```

- [ ] **Step 2: 编译确认无类型错误**

Run: `pnpm build 2>&1 | tail -3`
Expected: 构建成功（esbuild 不报错）。

- [ ] **Step 3: 提交**

```bash
git add src/lib/provider-apply.ts
git commit -m "feat(providers): shared provider-apply layer (applyToLayer/activate/delete/effective)"
```

---

## Task 3: 命令侧改用 provider-apply（去重）

**Files:**
- Modify: `src/commands/providers.ts`

- [ ] **Step 1: 替换 import 与本地 setActive/deleteProfile/writeUserSettings**

把 [src/commands/providers.ts:1-48](../../../src/commands/providers.ts) 顶部 import 段 + `writeUserSettings` + `setActive` + `deleteProfile` 三个本地函数整体替换为：

```ts
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import {
  readProviders, writeProviders, newId, secretKey, providersFilePath,
  PROVIDER_PRESETS,
  type Profile, type ProviderKind, type AuthMode, type ProviderPreset, type SecretsGateway,
} from '../core/providers';
import { activateProfile, deleteProfile } from '../lib/provider-apply';
import { CLAUDE_HOME } from '../lib/paths';
import { t } from '../lib/l10n';
```

> `promptCreateProfile` / `createFromPreset` 函数体保持不变（已含 KIMI 预设逻辑）。

- [ ] **Step 2: 改 quickSwitch 调 activateProfile**

把 `quickSwitch` 命令里原来调 `setActive(pick.id, secrets)` / `setActive(null, secrets)` 两处改为 `activateProfile(pick.id, secrets)` / `activateProfile(null, secrets)`。

把 `create` 命令里 `if (doc.active === profile.id) await setActive(profile.id, secrets);` 改为 `if (doc.active === profile.id) await activateProfile(profile.id, secrets);`。

把 `delete` 命令里 `await deleteProfile(target.id, secrets);` 保持（现在指向导入的版本）。

把 `activateById` 命令里 `await setActive(id, secrets);` 改为 `await activateProfile(id, secrets);`。

- [ ] **Step 3: 编译 + 测试**

Run: `pnpm build 2>&1 | tail -3 && pnpm test 2>&1 | tail -3`
Expected: 构建成功；core 测试全绿（命令层无单测，确保没破坏 core）。

- [ ] **Step 4: 提交**

```bash
git add src/commands/providers.ts
git commit -m "refactor(providers): route commands through shared provider-apply"
```

---

## Task 4: 状态栏用 effectiveProfileId

**Files:**
- Modify: `src/lib/status-bar.ts`

- [ ] **Step 1: 替换 update 实现**

把 [src/lib/status-bar.ts:1-26](../../../src/lib/status-bar.ts) 的 import + `update` 改为：

```ts
import * as vscode from 'vscode';
import { readProviders } from '../core/providers';
import { effectiveProfileId } from './provider-apply';
import { CLAUDE_HOME } from './paths';
import { t } from './l10n';

export interface ProviderStatusBar {
  update(): Promise<void>;
  dispose(): void;
}

export function createProviderStatusBar(): ProviderStatusBar {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  item.command = 'claudeCopilot.providers.quickSwitch';
  item.show();

  async function update() {
    try {
      const id = await effectiveProfileId();
      const doc = await readProviders(CLAUDE_HOME);
      const active = doc.profiles.find(p => p.id === id);
      const label = active ? active.name : t('providers.statusBar.subscription');
      item.text = `$(rocket) ${label}`;
      item.tooltip = t('providers.statusBar.tooltip');
    } catch {
      item.text = '$(rocket) —';
    }
  }

  return { update, dispose: () => item.dispose() };
}
```

- [ ] **Step 2: 编译**

Run: `pnpm build 2>&1 | tail -3`
Expected: 成功。

- [ ] **Step 3: 提交**

```bash
git add src/lib/status-bar.ts
git commit -m "feat(providers): status bar shows effective profile across layers"
```

---

## Task 5: i18n key（en + zh-cn）

**Files:**
- Modify: `l10n/bundle.l10n.json`、`l10n/bundle.l10n.zh-cn.json`

- [ ] **Step 1: 英文 bundle 追加 key**

在 `l10n/bundle.l10n.json` 里 `"providers.deactivated"` 一行之后追加：

```json
  "providers.openManager": "Manage providers…",
  "providers.manage.title": "API Provider Manager",
  "providers.manage.subtitle": "Maintain all providers here; pick which one each layer uses in Settings",
  "providers.manage.quickAdd": "Quick add (key only)",
  "providers.manage.library": "Profile library",
  "providers.manage.activate": "Activate",
  "providers.manage.active": "● active",
  "providers.manage.edit": "Edit",
  "providers.manage.delete": "Delete",
  "providers.manage.newAdvanced": "+ New profile (advanced)",
  "providers.manage.openJson": "Open providers.json",
  "providers.manage.empty": "No profiles yet. Quick-add a preset or create one.",
  "providers.manage.name": "Profile name",
  "providers.manage.save": "Save",
  "providers.manage.cancel": "Cancel",
  "providers.manage.addToLibrary": "Add to library",
  "providers.manage.presetHint": "Writes {0} · key stored in OS keychain · not activated automatically",
  "providers.manage.deleteConfirm": "Delete profile \"{0}\"? Stored credentials will also be erased.",
  "providers.manage.secretUnchanged": "leave blank to keep current",
  "settings.activeProvider": "Active provider (this layer)",
  "settings.activeProvider.desc": "Writes into this layer's settings file; effective order Local > Project > User",
  "settings.activeProvider.none": "Not set (inherit / subscription)",
  "settings.activeProvider.projectHint": "This layer is committed to git; the selected provider's key will be written and committed (your call)."
```

- [ ] **Step 2: 中文 bundle 追加同名 key**

在 `l10n/bundle.l10n.zh-cn.json` 里 `"providers.deactivated"` 之后追加：

```json
  "providers.openManager": "管理接入方…",
  "providers.manage.title": "API Provider 管理",
  "providers.manage.subtitle": "在这里维护所有接入方；到 Settings 选择各层启用哪个",
  "providers.manage.quickAdd": "预设快加（只填 key）",
  "providers.manage.library": "Profile 库",
  "providers.manage.activate": "激活",
  "providers.manage.active": "● 激活中",
  "providers.manage.edit": "编辑",
  "providers.manage.delete": "删除",
  "providers.manage.newAdvanced": "+ 新建 Profile（高级）",
  "providers.manage.openJson": "打开 providers.json",
  "providers.manage.empty": "还没有 Profile。用预设快加，或新建一个。",
  "providers.manage.name": "Profile 名称",
  "providers.manage.save": "保存",
  "providers.manage.cancel": "取消",
  "providers.manage.addToLibrary": "添加到库",
  "providers.manage.presetHint": "写入 {0} · 凭证存系统钥匙串 · 不会自动启用",
  "providers.manage.deleteConfirm": "删除 Profile「{0}」？已存的凭证也会一并清除。",
  "providers.manage.secretUnchanged": "留空表示不修改",
  "settings.activeProvider": "本层启用的 Provider",
  "settings.activeProvider.desc": "写入本层 settings 文件；生效顺序 Local > Project > User",
  "settings.activeProvider.none": "未设置（继承 / 订阅）",
  "settings.activeProvider.projectHint": "此层会提交进 git，所选 Provider 的密钥将随之写入并提交（由你负责）。"
```

> 注意：JSON 末尾逗号。追加块第一行前要给上一行（`"providers.deactivated": "…"`）补逗号。

- [ ] **Step 3: 校验 JSON 合法**

Run: `node -e "JSON.parse(require('fs').readFileSync('l10n/bundle.l10n.json','utf8'));JSON.parse(require('fs').readFileSync('l10n/bundle.l10n.zh-cn.json','utf8'));console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: 提交**

```bash
git add l10n/bundle.l10n.json l10n/bundle.l10n.zh-cn.json
git commit -m "i18n: provider manager webui + layer selector strings"
```

---

## Task 6: Provider 管理面板 host `provider-panel.ts`

**Files:**
- Create: `src/webview/provider-panel.ts`

RPC 统一：`providers:list` / `providers:save`（新建+编辑合一）/ `providers:delete` / `providers:activate` / `providers:openJson`。
预设快加在客户端用 preset 字段拼成 save payload，无需单独 RPC。

- [ ] **Step 1: 创建文件**

```ts
import * as vscode from 'vscode';
import * as path from 'path';
import {
  readProviders, writeProviders, newId, secretKey, providersFilePath,
  PROVIDER_PRESETS,
  type Profile, type SecretsGateway,
} from '../core/providers';
import { activateProfile, deleteProfile, effectiveProfileId } from '../lib/provider-apply';
import { makeSecretsGateway } from '../lib/secrets';
import { CLAUDE_HOME } from '../lib/paths';
import { makeNonce, type RpcRequest, type RpcResponse } from './messaging';
import { t } from '../lib/l10n';

let current: vscode.WebviewPanel | null = null;
const refreshers: (() => void)[] = [];

const PROVIDER_KEYS = [
  'common.loading', 'common.preparing',
  'providers.manage.title', 'providers.manage.subtitle', 'providers.manage.quickAdd',
  'providers.manage.library', 'providers.manage.activate', 'providers.manage.active',
  'providers.manage.edit', 'providers.manage.delete', 'providers.manage.newAdvanced',
  'providers.manage.openJson', 'providers.manage.empty', 'providers.manage.name',
  'providers.manage.save', 'providers.manage.cancel', 'providers.manage.addToLibrary',
  'providers.manage.presetHint', 'providers.manage.deleteConfirm', 'providers.manage.secretUnchanged',
  'providers.statusBar.subscription',
  'settings.provider.anthropic', 'settings.provider.bedrock', 'settings.provider.vertex', 'settings.provider.foundry',
  'settings.authMode.apiKey', 'settings.authMode.authToken', 'settings.authMode.helper', 'settings.authMode.subscription',
  'settings.env.apiKey', 'settings.env.authToken', 'settings.env.apiKeyHelper', 'settings.env.baseUrl',
  'settings.env.bedrockToken', 'settings.env.vertexProjectId', 'settings.env.foundryApiKey',
  'settings.env.foundryResource', 'settings.env.skipAuth',
];

export function registerProviderPanelRefresh(cb: () => void): void { refreshers.push(cb); }

interface ProviderFormPayload {
  id?: string;
  name: string;
  kind: Profile['kind'];
  authMode?: 'subscription' | 'apiKey' | 'authToken' | 'helper';
  baseUrl?: string;
  apiKeyHelper?: string;
  projectId?: string;
  resource?: string;
  skipAuth?: boolean;
  secret?: string;
}

function secretFieldFor(payload: ProviderFormPayload): string | null {
  if (payload.kind === 'anthropic') {
    return payload.authMode === 'apiKey' ? 'apiKey' : payload.authMode === 'authToken' ? 'authToken' : null;
  }
  if (payload.kind === 'bedrock') return 'bedrockToken';
  if (payload.kind === 'foundry') return 'foundryApiKey';
  return null;
}

function setHasFlag(target: any, field: string, has: boolean): void {
  if (field === 'apiKey') target.hasApiKey = has;
  else if (field === 'authToken') target.hasAuthToken = has;
  else if (field === 'bedrockToken') target.hasBearerToken = has;
  else if (field === 'foundryApiKey') target.hasApiKey = has;
}

function existingHasFlag(p: Profile | undefined, field: string): boolean {
  if (!p) return false;
  if (field === 'apiKey') return !!(p as any).hasApiKey;
  if (field === 'authToken') return !!(p as any).hasAuthToken;
  if (field === 'bedrockToken') return !!(p as any).hasBearerToken;
  if (field === 'foundryApiKey') return !!(p as any).hasApiKey;
  return false;
}

async function saveProfile(payload: ProviderFormPayload, secrets: SecretsGateway): Promise<void> {
  const doc = await readProviders(CLAUDE_HOME);
  const id = payload.id ?? newId();
  const existing = doc.profiles.find(p => p.id === id);
  const base: any = { id, name: payload.name, kind: payload.kind };

  if (payload.kind === 'anthropic') {
    base.authMode = payload.authMode ?? 'subscription';
    if (payload.baseUrl) base.baseUrl = payload.baseUrl;
    if (payload.authMode === 'helper' && payload.apiKeyHelper) base.apiKeyHelper = payload.apiKeyHelper;
  } else if (payload.kind === 'bedrock') {
    if (payload.baseUrl) base.baseUrl = payload.baseUrl;
    if (payload.skipAuth) base.skipAuth = true;
  } else if (payload.kind === 'vertex') {
    if (payload.projectId) base.projectId = payload.projectId;
    if (payload.baseUrl) base.baseUrl = payload.baseUrl;
    if (payload.skipAuth) base.skipAuth = true;
  } else if (payload.kind === 'foundry') {
    if (payload.resource) base.resource = payload.resource;
    if (payload.baseUrl) base.baseUrl = payload.baseUrl;
    if (payload.skipAuth) base.skipAuth = true;
  }

  const field = secretFieldFor(payload);
  if (field) {
    if (payload.secret) await secrets.set(secretKey(id, field), payload.secret);
    setHasFlag(base, field, payload.secret ? true : existingHasFlag(existing, field));
  }

  const idx = doc.profiles.findIndex(p => p.id === id);
  if (idx >= 0) doc.profiles[idx] = base as Profile; else doc.profiles.push(base as Profile);
  await writeProviders(CLAUDE_HOME, doc);
}

export function openProviderPanel(context: vscode.ExtensionContext): void {
  if (current) { current.reveal(); return; }
  const panel = vscode.window.createWebviewPanel(
    'claudeCopilot.providerManager', t('providers.manage.title'), vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'))],
    },
  );
  current = panel;

  const distRoot = vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'));
  const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'assets', 'provider.js'));
  const cssUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'assets', 'src.css'));
  const nonce = makeNonce();
  const csp = `default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource} 'nonce-${nonce}';`;

  const strings: Record<string, string> = {};
  for (const key of PROVIDER_KEYS) strings[key] = t(key);

  panel.webview.html = /* html */`
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="${csp}">
        <link rel="stylesheet" href="${cssUri}" />
        <title>${t('providers.manage.title')}</title>
      </head>
      <body>
        <script nonce="${nonce}">window.__l10n = ${JSON.stringify(strings)};</script>
        <div id="root"></div>
        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
      </body>
    </html>`;

  let disposed = false;
  panel.onDidDispose(() => { disposed = true; current = null; });

  const fireRefresh = () => refreshers.forEach(r => r());

  panel.webview.onDidReceiveMessage(async (req: RpcRequest) => {
    let res: RpcResponse;
    const secrets = makeSecretsGateway(context);
    try {
      if (req.method === 'providers:list') {
        const doc = await readProviders(CLAUDE_HOME);
        const effectiveId = await effectiveProfileId();
        res = { id: req.id, result: { active: doc.active, effectiveId, profiles: doc.profiles, presets: PROVIDER_PRESETS } };
      } else if (req.method === 'providers:save') {
        await saveProfile(req.params as ProviderFormPayload, secrets);
        fireRefresh();
        res = { id: req.id, result: 'ok' };
      } else if (req.method === 'providers:delete') {
        await deleteProfile((req.params as { id: string }).id, secrets);
        fireRefresh();
        res = { id: req.id, result: 'ok' };
      } else if (req.method === 'providers:activate') {
        await activateProfile((req.params as { id: string | null }).id, secrets);
        fireRefresh();
        res = { id: req.id, result: 'ok' };
      } else if (req.method === 'providers:openJson') {
        const p = providersFilePath(CLAUDE_HOME);
        try { await vscode.workspace.fs.stat(vscode.Uri.file(p)); }
        catch { await writeProviders(CLAUDE_HOME, await readProviders(CLAUDE_HOME)); }
        const docu = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
        await vscode.window.showTextDocument(docu, vscode.ViewColumn.Beside);
        res = { id: req.id, result: 'ok' };
      } else {
        res = { id: req.id, error: `unknown method ${req.method}` };
      }
    } catch (e: any) {
      res = { id: req.id, error: e?.message || String(e) };
    }
    if (!disposed) panel.webview.postMessage(res);
  });
}
```

- [ ] **Step 2: 编译（webview 入口未建会缺 asset，但 host TS 本身要过）**

Run: `pnpm exec esbuild src/extension.ts --bundle --outfile=/tmp/ext-check.js --external:vscode --platform=node --format=cjs --target=node18 2>&1 | tail -5`
Expected: 暂时会因 extension.ts 未引用而无影响；本步只验证 provider-panel.ts 语法。若报错按提示修。（完整接线在 Task 8。）

- [ ] **Step 3: 提交**

```bash
git add src/webview/provider-panel.ts
git commit -m "feat(providers): provider manager webview host + RPC"
```

---

## Task 7: Provider 管理 webview UI

**Files:**
- Create: `webview-ui/provider.html`、`webview-ui/src/provider.ts`、`webview-ui/src/provider-app.ts`
- Modify: `webview-ui/vite.config.ts`

- [ ] **Step 1: vite 加入口**

把 `webview-ui/vite.config.ts` 的 `input` 块改为：

```ts
      input: {
        usage: path.resolve(__dirname, 'usage.html'),
        marketplace: path.resolve(__dirname, 'marketplace.html'),
        settings: path.resolve(__dirname, 'settings.html'),
        provider: path.resolve(__dirname, 'provider.html'),
      },
```

- [ ] **Step 2: 创建 `webview-ui/provider.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Claude Copilot — API Provider</title>
  </head>
  <body class="bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]">
    <div id="root"></div>
    <script type="module" src="/src/provider.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: 创建 `webview-ui/src/provider.ts`**

```ts
import { mount } from './provider-app';
import './index.css';

const root = document.getElementById('root');
if (root) mount(root);
```

- [ ] **Step 4: 创建 `webview-ui/src/provider-app.ts`**

```ts
import { call } from './rpc';
import { t } from './l10n';

type Kind = 'anthropic' | 'bedrock' | 'vertex' | 'foundry';
type AuthMode = 'subscription' | 'apiKey' | 'authToken' | 'helper';

interface Preset { id: string; label: string; kind: Kind; authMode: AuthMode; baseUrl: string; credentialField: 'apiKey' | 'authToken'; }
interface Profile {
  id: string; name: string; kind: Kind;
  authMode?: AuthMode; baseUrl?: string; apiKeyHelper?: string;
  hasApiKey?: boolean; hasAuthToken?: boolean; hasBearerToken?: boolean;
  projectId?: string; resource?: string; skipAuth?: boolean;
}
interface ListResult { active: string | null; effectiveId: string | null; profiles: Profile[]; presets: Preset[]; }

interface FormState {
  id?: string; name: string; kind: Kind;
  authMode: AuthMode; baseUrl: string; apiKeyHelper: string;
  projectId: string; resource: string; skipAuth: boolean;
  secret: string;
  presetLabel?: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function mount(root: HTMLElement): void {
  let data: ListResult | null = null;
  let form: FormState | null = null;

  async function load() {
    data = await call<ListResult>('providers:list');
    render();
  }

  function startPreset(p: Preset) {
    form = {
      name: p.label, kind: p.kind, authMode: p.authMode, baseUrl: p.baseUrl,
      apiKeyHelper: '', projectId: '', resource: '', skipAuth: false, secret: '',
      presetLabel: p.label,
    };
    render();
  }

  function startNew() {
    form = { name: '', kind: 'anthropic', authMode: 'apiKey', baseUrl: '', apiKeyHelper: '', projectId: '', resource: '', skipAuth: false, secret: '' };
    render();
  }

  function startEdit(p: Profile) {
    form = {
      id: p.id, name: p.name, kind: p.kind,
      authMode: p.authMode ?? 'apiKey', baseUrl: p.baseUrl ?? '', apiKeyHelper: p.apiKeyHelper ?? '',
      projectId: p.projectId ?? '', resource: p.resource ?? '', skipAuth: !!p.skipAuth, secret: '',
    };
    render();
  }

  async function save() {
    if (!form || !form.name.trim()) return;
    await call('providers:save', {
      id: form.id, name: form.name.trim(), kind: form.kind,
      authMode: form.kind === 'anthropic' ? form.authMode : undefined,
      baseUrl: form.baseUrl || undefined,
      apiKeyHelper: form.apiKeyHelper || undefined,
      projectId: form.projectId || undefined,
      resource: form.resource || undefined,
      skipAuth: form.skipAuth || undefined,
      secret: form.secret || undefined,
    });
    form = null;
    await load();
  }

  async function activate(id: string) { await call('providers:activate', { id }); await load(); }
  async function del(p: Profile) {
    if (!confirm(t('providers.manage.deleteConfirm', p.name))) return;
    await call('providers:delete', { id: p.id });
    await load();
  }

  function kindLabel(k: Kind): string { return t('settings.provider.' + k); }

  function renderList(): string {
    if (!data) return '';
    if (data.profiles.length === 0) return `<div class="text-sm opacity-60 px-1 py-3">${esc(t('providers.manage.empty'))}</div>`;
    return data.profiles.map(p => {
      const isActive = p.id === data!.active;
      const right = isActive
        ? `<span class="text-[11px] px-2 py-0.5 rounded-full text-[var(--vscode-textLink-foreground)] border border-[var(--vscode-textLink-foreground)]/40">${esc(t('providers.manage.active'))}</span>`
        : `<button data-act="${esc(p.id)}" class="text-[11px] px-2 py-0.5 border border-current/20 rounded opacity-80 hover:opacity-100 hover:bg-current/5">${esc(t('providers.manage.activate'))}</button>`;
      return `
        <div class="flex items-center gap-3 px-3 py-2.5 border-b border-current/10">
          <span class="font-medium">${esc(p.name)}</span>
          <span class="text-[11px] opacity-50 border border-current/15 rounded-full px-2">${esc(kindLabel(p.kind))}</span>
          <span class="text-[11px] opacity-45 font-mono truncate">${esc(p.baseUrl ?? '')}</span>
          <span class="flex-1"></span>
          ${right}
          <button data-edit="${esc(p.id)}" class="text-[11px] px-2 py-0.5 border border-current/20 rounded opacity-80 hover:opacity-100 hover:bg-current/5">${esc(t('providers.manage.edit'))}</button>
          <button data-del="${esc(p.id)}" class="text-[11px] px-2 py-0.5 border border-current/20 rounded opacity-80 hover:opacity-100 hover:bg-current/5">${esc(t('providers.manage.delete'))}</button>
        </div>`;
    }).join('');
  }

  function inp(id: string, value: string, ph: string, type = 'text'): string {
    return `<input id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(ph)}" class="w-full bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />`;
  }
  function fieldWrap(label: string, inner: string, hint = ''): string {
    return `<div class="space-y-1"><div class="text-sm font-medium">${esc(label)}</div>${hint ? `<div class="text-xs opacity-55">${esc(hint)}</div>` : ''}${inner}</div>`;
  }

  function renderForm(): string {
    if (!form) return '';
    const f = form;
    const isPreset = !!f.presetLabel;
    const kinds: Kind[] = ['anthropic', 'bedrock', 'vertex', 'foundry'];
    let body = '';

    if (!isPreset) {
      body += fieldWrap('Provider', `<select id="f-kind" class="w-full bg-transparent border border-current/20 rounded px-2 py-1.5 text-sm">
        ${kinds.map(k => `<option value="${k}" ${f.kind === k ? 'selected' : ''}>${esc(kindLabel(k))}</option>`).join('')}
      </select>`);
    }
    body += fieldWrap(t('providers.manage.name'), inp('f-name', f.name, 'KIMI CODE'));

    if (f.kind === 'anthropic') {
      if (!isPreset) {
        const modes: AuthMode[] = ['subscription', 'apiKey', 'authToken', 'helper'];
        body += fieldWrap('Auth', `<select id="f-authMode" class="w-full bg-transparent border border-current/20 rounded px-2 py-1.5 text-sm">
          ${modes.map(m => `<option value="${m}" ${f.authMode === m ? 'selected' : ''}>${esc(t('settings.authMode.' + m))}</option>`).join('')}
        </select>`);
      }
      if (f.authMode === 'apiKey') body += fieldWrap(t('settings.env.apiKey'), inp('f-secret', f.secret, f.id ? t('providers.manage.secretUnchanged') : 'sk-ant-…', 'password'));
      else if (f.authMode === 'authToken') body += fieldWrap(t('settings.env.authToken'), inp('f-secret', f.secret, f.id ? t('providers.manage.secretUnchanged') : '…', 'password'));
      else if (f.authMode === 'helper') body += fieldWrap(t('settings.env.apiKeyHelper'), inp('f-apiKeyHelper', f.apiKeyHelper, '/path/to/helper.sh'));
      if (!isPreset) body += fieldWrap(t('settings.env.baseUrl'), inp('f-baseUrl', f.baseUrl, 'https://api.anthropic.com'));
    } else if (f.kind === 'bedrock') {
      body += fieldWrap(t('settings.env.bedrockToken'), inp('f-secret', f.secret, f.id ? t('providers.manage.secretUnchanged') : '…', 'password'));
      body += fieldWrap(t('settings.env.baseUrl'), inp('f-baseUrl', f.baseUrl, 'https://bedrock-runtime…'));
    } else if (f.kind === 'vertex') {
      body += fieldWrap(t('settings.env.vertexProjectId'), inp('f-projectId', f.projectId, 'my-gcp-project'));
      body += fieldWrap(t('settings.env.baseUrl'), inp('f-baseUrl', f.baseUrl, 'https://…aiplatform.googleapis.com'));
    } else if (f.kind === 'foundry') {
      body += fieldWrap(t('settings.env.foundryApiKey'), inp('f-secret', f.secret, f.id ? t('providers.manage.secretUnchanged') : '…', 'password'));
      body += fieldWrap(t('settings.env.foundryResource'), inp('f-resource', f.resource, 'my-resource'));
      body += fieldWrap(t('settings.env.baseUrl'), inp('f-baseUrl', f.baseUrl, 'https://…inference.ml.azure.com'));
    }

    const presetHint = isPreset ? `<p class="text-xs opacity-55">${esc(t('providers.manage.presetHint', f.baseUrl))}</p>` : '';
    const title = isPreset ? `⚡ ${esc(f.presetLabel!)}` : (f.id ? t('providers.manage.edit') : t('providers.manage.newAdvanced'));
    return `
      <div class="rounded-lg border border-[var(--vscode-textLink-foreground)]/30 bg-[var(--vscode-textLink-foreground)]/[0.06] p-4 space-y-3 mt-3">
        <div class="font-semibold">${title}</div>
        ${body}
        ${presetHint}
        <div class="flex gap-2 pt-1">
          <button id="f-save" class="px-3 py-1.5 rounded text-sm border-none bg-[var(--vscode-textLink-foreground)] text-white">${esc(isPreset ? t('providers.manage.addToLibrary') : t('providers.manage.save'))}</button>
          <button id="f-cancel" class="px-3 py-1.5 rounded text-sm border border-current/20 hover:bg-current/5">${esc(t('providers.manage.cancel'))}</button>
        </div>
      </div>`;
  }

  function render() {
    if (!data) { root.innerHTML = `<div class="p-6 text-sm opacity-70">${esc(t('common.loading'))}</div>`; return; }
    const presets = data.presets.map(p => `<button data-preset="${esc(p.id)}" class="text-sm px-3 py-1.5 border border-current/20 rounded-lg bg-current/[0.03] hover:bg-current/5">+ ${esc(p.label)}</button>`).join('');
    root.innerHTML = `
      <div class="p-6 max-w-3xl mx-auto space-y-5">
        <div>
          <h1 class="text-2xl font-semibold flex items-center gap-2">🚀 ${esc(t('providers.manage.title'))}</h1>
          <p class="text-xs opacity-55 mt-1">${esc(t('providers.manage.subtitle'))}</p>
        </div>
        <section class="space-y-2">
          <div class="text-xs uppercase tracking-wider opacity-50">${esc(t('providers.manage.quickAdd'))}</div>
          <div class="flex gap-2 flex-wrap">${presets}</div>
        </section>
        <section class="space-y-2">
          <div class="text-xs uppercase tracking-wider opacity-50">${esc(t('providers.manage.library'))}</div>
          <div class="rounded-lg border border-current/15 overflow-hidden">${renderList()}</div>
          ${form ? renderForm() : `
          <div class="flex gap-2 pt-1">
            <button id="p-new" class="text-xs px-3 py-1.5 border border-current/20 rounded hover:bg-current/5">${esc(t('providers.manage.newAdvanced'))}</button>
            <button id="p-json" class="text-xs px-3 py-1.5 opacity-70 hover:opacity-100">${esc(t('providers.manage.openJson'))}</button>
          </div>`}
        </section>
      </div>`;
    bind();
  }

  function bindForm() {
    if (!form) return;
    const f = form;
    const g = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id);
    g<HTMLSelectElement>('f-kind')?.addEventListener('change', e => { f.kind = (e.target as HTMLSelectElement).value as Kind; render(); });
    g<HTMLSelectElement>('f-authMode')?.addEventListener('change', e => { f.authMode = (e.target as HTMLSelectElement).value as AuthMode; render(); });
    g<HTMLInputElement>('f-name')?.addEventListener('input', e => f.name = (e.target as HTMLInputElement).value);
    g<HTMLInputElement>('f-secret')?.addEventListener('input', e => f.secret = (e.target as HTMLInputElement).value);
    g<HTMLInputElement>('f-baseUrl')?.addEventListener('input', e => f.baseUrl = (e.target as HTMLInputElement).value);
    g<HTMLInputElement>('f-apiKeyHelper')?.addEventListener('input', e => f.apiKeyHelper = (e.target as HTMLInputElement).value);
    g<HTMLInputElement>('f-projectId')?.addEventListener('input', e => f.projectId = (e.target as HTMLInputElement).value);
    g<HTMLInputElement>('f-resource')?.addEventListener('input', e => f.resource = (e.target as HTMLInputElement).value);
    g('f-save')?.addEventListener('click', () => void save());
    g('f-cancel')?.addEventListener('click', () => { form = null; render(); });
  }

  function bind() {
    if (!data) return;
    root.querySelectorAll<HTMLButtonElement>('button[data-preset]').forEach(b =>
      b.addEventListener('click', () => { const p = data!.presets.find(x => x.id === b.dataset.preset); if (p) startPreset(p); }));
    root.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach(b =>
      b.addEventListener('click', () => void activate(b.dataset.act!)));
    root.querySelectorAll<HTMLButtonElement>('button[data-edit]').forEach(b =>
      b.addEventListener('click', () => { const p = data!.profiles.find(x => x.id === b.dataset.edit); if (p) startEdit(p); }));
    root.querySelectorAll<HTMLButtonElement>('button[data-del]').forEach(b =>
      b.addEventListener('click', () => { const p = data!.profiles.find(x => x.id === b.dataset.del); if (p) void del(p); }));
    root.querySelector('#p-new')?.addEventListener('click', () => startNew());
    root.querySelector('#p-json')?.addEventListener('click', () => void call('providers:openJson'));
    bindForm();
  }

  load();
}
```

- [ ] **Step 5: 构建确认 provider bundle 产出**

Run: `pnpm build 2>&1 | grep -E "provider\.js|error" `
Expected: 出现 `assets/provider.js`，无 error。

- [ ] **Step 6: 提交**

```bash
git add webview-ui/provider.html webview-ui/src/provider.ts webview-ui/src/provider-app.ts webview-ui/vite.config.ts
git commit -m "feat(providers): provider manager webview UI + vite entry"
```

---

## Task 8: 扩展接线（命令 + watcher）

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: 加 import**

在 [src/extension.ts:19](../../../src/extension.ts) `openSettingsPanel` import 下面加：

```ts
import { openProviderPanel, registerProviderPanelRefresh } from './webview/provider-panel';
```

- [ ] **Step 2: 注册命令**

在 `claudeCopilot.openMarketplace` 注册行之后加：

```ts
    vscode.commands.registerCommand('claudeCopilot.openProviderPanel', () => openProviderPanel(context)),
```

- [ ] **Step 3: provider 面板变更后刷新侧栏/状态栏**

在 `registerMarketplaceRefresh(() => plugins.refresh());` 之后加：

```ts
  registerProviderPanelRefresh(() => { void statusBar.update(); settings.refresh(); });
```

- [ ] **Step 4: package.json 声明命令**

在 `package.json` 的 `contributes.commands` 数组里、`openSettingsPanel` 那条之后加：

```json
      { "command": "claudeCopilot.openProviderPanel", "title": "%cmd.openProviderPanel%", "icon": "$(rocket)" },
```

在 `package.nls.json` 加 `"cmd.openProviderPanel": "Manage API Providers"`；`package.nls.zh-cn.json` 加 `"cmd.openProviderPanel": "管理 API 接入方"`。

- [ ] **Step 5: 构建**

Run: `pnpm build 2>&1 | tail -3`
Expected: 成功。

- [ ] **Step 6: 提交**

```bash
git add src/extension.ts package.json package.nls.json package.nls.zh-cn.json
git commit -m "feat(providers): wire provider manager panel command + refresh"
```

---

## Task 9: 侧栏 API Provider 节点变叶子

**Files:**
- Modify: `src/tree/settings-tree.ts`

- [ ] **Step 1: profile-group 变叶子并接命令**

把 [src/tree/settings-tree.ts:27-34](../../../src/tree/settings-tree.ts) 的 `profile-group` 分支改为：

```ts
    if (node.kind === 'profile-group') {
      const label = `${t('tree.providers.label')} · ${node.activeName}`;
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('rocket');
      item.tooltip = t('providers.openManager');
      item.contextValue = 'profile-group';
      item.command = { command: 'claudeCopilot.openProviderPanel', title: 'Manage providers' };
      return item;
    }
```

- [ ] **Step 2: 移除 profile 子节点的 getChildren 分支 + 生效名用 effectiveProfileId**

把 [src/tree/settings-tree.ts:68-90](../../../src/tree/settings-tree.ts) 的 `getChildren` 改为：

```ts
  async getChildren(element?: Node): Promise<Node[]> {
    if (!element) {
      const doc = await readProviders(CLAUDE_HOME);
      const effId = await effectiveProfileId();
      const active = doc.profiles.find(p => p.id === effId);
      const profileName = active ? active.name : t('providers.statusBar.subscription');
      const ws = currentWorkspace();
      return [
        { kind: 'profile-group', activeName: profileName },
        { kind: 'layer', layer: 'user', path: userSettingsPath(CLAUDE_HOME), available: true },
        { kind: 'layer', layer: 'project', path: ws ? projectSettingsPath(ws.fsPath) : '', available: !!ws },
        { kind: 'layer', layer: 'local', path: ws ? localSettingsPath(ws.fsPath) : '', available: !!ws },
      ];
    }
    return [];
  }
```

- [ ] **Step 3: 清理无用类型/import + 加 effectiveProfileId import**

- 把 `Node` 联合类型里 `profile-subscription` / `profile-item` 两个成员删掉（只留 `layer` 和 `profile-group`）。
- 删掉 `getTreeItem` 里 `profile-subscription` 和 `profile-item` 两个分支。
- 顶部加 `import { effectiveProfileId } from '../lib/provider-apply';`。

- [ ] **Step 4: 构建 + 测试**

Run: `pnpm build 2>&1 | tail -3 && pnpm test 2>&1 | tail -3`
Expected: 成功；core 测试全绿。

- [ ] **Step 5: 提交**

```bash
git add src/tree/settings-tree.ts
git commit -m "feat(providers): sidebar API Provider node opens manager (leaf)"
```

---

## Task 10: Settings 面板 RPC（分层选择器后端）

**Files:**
- Modify: `src/webview/settings-panel.ts`

- [ ] **Step 1: 扩展 settings:read 返回 profiles + activeProfileId**

把 [src/webview/settings-panel.ts:269-281](../../../src/webview/settings-panel.ts) 的 `settings:read` 分支改为：

```ts
      if (req.method === 'settings:read') {
        const layer = req.params?.layer as Layer;
        const existing = await readLayer(layer);
        const installed = await listInstalledPlugins(CLAUDE_HOME);
        const doc = await readProviders(CLAUDE_HOME);
        const settingsObj = existing?.settings ?? {};
        res = {
          id: req.id,
          result: {
            layer,
            settings: settingsObj,
            availableLayers: availability(),
            installedPlugins: installed.map(p => ({ key: `${p.name}@${p.marketplace}`, name: p.name, marketplace: p.marketplace })),
            profiles: doc.profiles.map(p => ({ id: p.id, name: p.name, kind: p.kind, baseUrl: (p as any).baseUrl ?? '' })),
            activeProfileId: matchProfileIdByEnv(settingsObj, doc.profiles),
          },
        };
      }
```

- [ ] **Step 2: 新增 settings:setLayerProvider；移除 providers:activate / providers:delete**

把 [src/webview/settings-panel.ts:294-330](../../../src/webview/settings-panel.ts) 的 `providers:list` / `providers:activate` / `providers:delete` 三个分支整体替换为：

```ts
      } else if (req.method === 'settings:setLayerProvider') {
        const { layer, id } = req.params as { layer: Layer; id: string | null };
        const secrets = makeSecretsGateway(context);
        await applyToLayer(layer, id, secrets);
        res = { id: req.id, result: 'ok' };
```

- [ ] **Step 3: 修 import**

- 顶部 providers import 改为：`import { readProviders, matchProfileIdByEnv } from '../core/providers';`
- 加：`import { applyToLayer } from '../lib/provider-apply';`
- 移除不再用到的 `writeProviders, applyProfileToSettings, deactivateFromSettings, secretKey`（若其它分支仍用 `makeSecretsGateway` 则保留它）。
- 移除不再用到的 `fs` / `path` / `userSettingsPath` 等仅服务于旧 activate/delete 的 import（保留 settings:openJson 仍需的）。构建报「unused」不会失败，但按需清理。
- `SETTINGS_KEYS` 加 `'settings.activeProvider'`、`'settings.activeProvider.desc'`、`'settings.activeProvider.none'`、`'settings.activeProvider.projectHint'`。

- [ ] **Step 4: 构建**

Run: `pnpm build 2>&1 | tail -3`
Expected: 成功。

- [ ] **Step 5: 提交**

```bash
git add src/webview/settings-panel.ts
git commit -m "feat(settings): layer-scoped provider selector RPC; drop in-panel provider CRUD"
```

---

## Task 11: Settings 表单（去 providerStrip + 加分层选择器）

**Files:**
- Modify: `webview-ui/src/settings-form.ts`

- [ ] **Step 1: SettingsData 接口加字段**

把 [webview-ui/src/settings-form.ts:9-14](../../../webview-ui/src/settings-form.ts) 的 `SettingsData` 改为：

```ts
interface ProfileSummary { id: string; name: string; kind: string; baseUrl: string }
interface SettingsData {
  layer: Layer;
  settings: Record<string, unknown>;
  availableLayers: LayerAvailability;
  installedPlugins: InstalledPluginSummary[];
  profiles: ProfileSummary[];
  activeProfileId: string | null;
}
```

- [ ] **Step 2: 删除 providerStrip 与 providers:list 调用**

- 删除 `providerStrip(...)` 整个函数（约 [webview-ui/src/settings-form.ts:493-542](../../../webview-ui/src/settings-form.ts)）。
- 在 `load()` 里删除 `state.providers = await call<ProvidersData>('providers:list').catch(() => null);` 这一行。
- 删除 state 里 `providers` / `providersExpanded` 字段及其在 State 接口、初始化处的引用。
- 删除 `ProvidersData` 类型定义（若存在）与所有 `providers-toggle` / `providers-new` / `providers-manage` / `provider-switch-btn` 等事件绑定块。
- 删除 render() 中 `${state.providers ? providerStrip(state.providers) : ''}` 一行。

> 编译报错会逐条指出残留引用，按提示删干净。

- [ ] **Step 3: 加分层选择器渲染**

在 `render()` 里、`renderLayerBadge()` 之后插入选择器（替换原 providerStrip 的位置）：

```ts
        ${renderProviderSelect()}
```

并新增函数（放在 `renderLayerBadge` 附近）：

```ts
  function renderProviderSelect(): string {
    if (!state.data) return '';
    const cur = state.data.activeProfileId ?? '';
    const opts = [`<option value="" ${cur === '' ? 'selected' : ''}>${escapeHtml(t('settings.activeProvider.none'))}</option>`]
      .concat(state.data.profiles.map(p =>
        `<option value="${escapeHtml(p.id)}" ${cur === p.id ? 'selected' : ''}>${escapeHtml(p.name)}${p.baseUrl ? ' — ' + escapeHtml(p.baseUrl) : ''}</option>`));
    const projectHint = state.layer === 'project'
      ? `<div class="mt-2 text-[11px] opacity-75 border border-yellow-500/35 bg-yellow-500/10 rounded px-2 py-1.5">⚠ ${escapeHtml(t('settings.activeProvider.projectHint'))}</div>`
      : '';
    return `
      <div class="rounded-lg border border-current/15 p-4 space-y-1.5">
        <div class="text-sm font-medium">${escapeHtml(t('settings.activeProvider'))}</div>
        <div class="text-xs opacity-60">${escapeHtml(t('settings.activeProvider.desc'))}</div>
        <select id="layer-provider" class="w-full bg-transparent border border-current/20 rounded px-2 py-1.5 text-sm mt-1">${opts.join('')}</select>
        ${projectHint}
      </div>`;
  }
```

- [ ] **Step 4: 绑定 onChange**

在 `bind()` 顶部（toggle groups 之前）加：

```ts
    root.querySelector<HTMLSelectElement>('#layer-provider')?.addEventListener('change', async (e) => {
      const id = (e.target as HTMLSelectElement).value || null;
      await call('settings:setLayerProvider', { layer: state.layer, id });
      await load();
    });
```

- [ ] **Step 5: 构建**

Run: `pnpm build 2>&1 | grep -E "settings\.js|error"`
Expected: 出现 `assets/settings.js`，无 error。

- [ ] **Step 6: 提交**

```bash
git add webview-ui/src/settings-form.ts
git commit -m "feat(settings): replace provider strip with layer-scoped provider selector"
```

---

## Task 12: 收尾 — 构建 / 测试 / 打包 / 手动验证

**Files:** 无（验证 + 文档勾选）

- [ ] **Step 1: 全量构建 + 测试**

Run: `pnpm build && pnpm test 2>&1 | tail -4`
Expected: 构建成功；core 测试全绿（原 62 + Task 1 新增 6 ≈ 68）。

- [ ] **Step 2: 类型检查（webview-ui 必须干净）**

Run: `pnpm -C webview-ui exec tsc --noEmit 2>&1 | tail -5`
Expected: 无输出（干净）。根目录 `tsc` 那条既有的 `src/commands/mcp.ts` 报错可忽略（与本特性无关、esbuild 不受影响）。

- [ ] **Step 3: 打包，确认无开发副产物**

Run: `pnpm package 2>&1 | tail -6`
Expected: 产出 `claude-copilot-<ver>.vsix`；文件清单不含 `.playwright-mcp/`、`docs/`（`.vscodeignore` 已排除 `src/`，docs 默认随包？若包含则在 `.vscodeignore` 加 `docs/`）。

- [ ] **Step 4: 手动验证（Extension Dev Host，F5，打开一个有 workspace 的目录）**

  1. 侧栏点 🚀 `API Provider · <名>` → 打开管理 webview。
  2. 预设快加 `+ KIMI CODE` → 填名+key → 添加到库 → 列表出现，未激活。
  3. 点该行「激活」→ `~/.claude/settings.json` 出现 `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`；状态栏变 KIMI；侧栏标签更新。
  4. 侧栏点 Local → Settings 打开（Local 层）→「本层启用的 Provider」选另一个 → `.claude/settings.local.json` 写入；状态栏生效名变它。
  5. Local 层选「未设置」→ `.claude/settings.local.json` 的 managed env 被剥离 → 状态栏回落到 active。
  6. project 层打开 → 选择器可用 + 显示黄色 hint；选一个 → 写进 `.claude/settings.json`（不被拦截）。
  7. 管理 webview「编辑」一个 Profile，密钥留空保存 → 凭证不变；改名生效。
  8. 「删除」激活中的 Profile → user 层 managed env 被剥离、active 清空。

- [ ] **Step 5: 最终提交（如有未提交的清理）**

```bash
git add -A
git commit -m "chore(providers): finalize provider manager webui + layer selector"
```

---

## 备注 / 与 spec 的实现差异

- spec 写了 `providers:createFromPreset`，实现里**合并进 `providers:save`**（客户端用 preset 字段拼 payload），少一个 RPC，更 DRY。
- spec 的 `activateProfile` 即「激活」机制（旧称设为用户默认），UI 文案统一为「激活」。
- 之前 Settings 内的 `providerStrip`（订阅/Profile 行内切换）整体移除，能力迁到管理 webview + 分层选择器。
- 旧的 `claudeCopilot.providers.quickSwitch` / `create` / `edit` / `delete` / `activateById` 命令保留（状态栏与命令面板仍可用），内部已统一走 `provider-apply`。
