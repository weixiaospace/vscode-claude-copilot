# Provider Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make provider delete safe/clear (warn + toast when deleting the active profile), polish the manager modal (name validation, secret-set indicator, preset title), and remove two dead/duplicate commands.

**Architecture:** Small, surgical edits across the existing provider surfaces — no new views/commands/RPC. `deleteProfile()` gains a boolean return (wasActive) consumed by its two callers for toasts; the manager webview gets clarity tweaks; `providers.activateById` (dead) and `providers.create` (duplicate of `openProviderPanel`) are removed.

**Tech Stack:** TypeScript, VSCode API, vanilla-TS webview (Vite/Tailwind), l10n via `t()` + per-panel injection whitelist.

> **Testing note:** `provider-apply.ts` has no unit-test harness (it imports vscode via `lib/workspace`); the tested layer is `src/core`. Verification per task = `pnpm build` + `pnpm test` (must stay **71 passing**) + `cd webview-ui && pnpm exec tsc --noEmit` + the listed manual F5 checks. Spec: [2026-05-29-provider-polish-design.md](../specs/2026-05-29-provider-polish-design.md).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/provider-apply.ts` | `deleteProfile` returns `wasActive: boolean` | 1 |
| `src/commands/providers.ts` | delete: single read + active-aware confirm + toast; (T3) remove `create`/`activateById` | 1, 3 |
| `src/webview/provider-panel.ts` | `providers:delete` handler toasts on wasActive; add new webview keys to `PROVIDER_KEYS` | 1, 2 |
| `webview-ui/src/provider-app.ts` | active-aware delete confirm, name validation, secret-set hint, preset title | 2 |
| `l10n/bundle.l10n.json` / `.zh-cn.json` | add 6 keys | 1, 2 |
| `package.json` / `package.nls.json` / `package.nls.zh-cn.json` | remove `create`/`activateById` command + nls | 3 |

---

## Task 1: Delete-active feedback (backend + command + host toast)

**Files:**
- Modify: `src/lib/provider-apply.ts` (`deleteProfile`)
- Modify: `src/commands/providers.ts` (`providers.delete` handler)
- Modify: `src/webview/provider-panel.ts` (`providers:delete` RPC handler)
- Modify: `l10n/bundle.l10n.json`, `l10n/bundle.l10n.zh-cn.json`

- [ ] **Step 1: `deleteProfile` returns wasActive**

In `src/lib/provider-apply.ts`, change the signature and the final return. Current function ends by computing `wasActive` and stripping the user layer; just return that boolean:

```ts
/** Delete a profile: clear its secrets + remove from library; if it was active, null it out and strip the user layer. Returns whether it was the active profile. */
export async function deleteProfile(id: string, secrets: SecretsGateway): Promise<boolean> {
  const doc = await readProviders(CLAUDE_HOME);
  if (!doc.profiles.some(p => p.id === id)) return false;
  for (const field of ['apiKey', 'authToken', 'bedrockToken', 'foundryApiKey']) {
    await secrets.delete(secretKey(id, field));
  }
  doc.profiles = doc.profiles.filter(p => p.id !== id);
  const wasActive = doc.active === id;
  if (wasActive) doc.active = null;
  await writeProviders(CLAUDE_HOME, doc);
  if (wasActive) await applyToLayer('user', null, secrets);
  return wasActive;
}
```

- [ ] **Step 2: Add l10n keys to BOTH bundles**

In `l10n/bundle.l10n.json` (place near the other `providers.delete.*` / `providers.deactivated` keys):
```
"providers.delete.confirmActive": "Delete \"{0}\"? It's the active provider — deleting reverts to subscription mode. Stored credentials will also be erased.",
"providers.deactivatedAfterDelete": "Deleted \"{0}\"; reverted to subscription mode.",
```
In `l10n/bundle.l10n.zh-cn.json` (matching keys):
```
"providers.delete.confirmActive": "删除「{0}」？它是当前活动接入方——删除将回退到订阅模式。已存的凭证也会一并清除。",
"providers.deactivatedAfterDelete": "已删除「{0}」；已回退到订阅模式。",
```

- [ ] **Step 3: Rewrite the `providers.delete` command handler**

In `src/commands/providers.ts`, replace the whole `providers.delete` registration block (it currently reads `readProviders` twice and uses a non-active-aware confirm) with this single-read, active-aware version:

```ts
    vscode.commands.registerCommand('claudeCopilot.providers.delete', async (arg?: { id?: string }) => {
      const doc = await readProviders(CLAUDE_HOME);
      if (!doc.profiles.length) return;
      let id: string | undefined = arg?.id;
      if (!id) {
        const pick = await vscode.window.showQuickPick(
          doc.profiles.map(p => ({ label: p.name, description: p.kind, id: p.id })),
          { title: t('providers.delete.pickTarget') },
        );
        if (!pick) return;
        id = pick.id;
      }
      const target = doc.profiles.find(p => p.id === id);
      if (!target) return;
      const isActive = doc.active === target.id;
      const message = isActive
        ? t('providers.delete.confirmActive', target.name)
        : t('providers.delete.confirm', target.name);
      const confirm = await vscode.window.showWarningMessage(message, { modal: true }, t('providers.delete.confirmBtn'));
      if (confirm !== t('providers.delete.confirmBtn')) return;
      const wasActive = await deleteProfile(target.id, secrets);
      if (wasActive) vscode.window.showInformationMessage(t('providers.deactivatedAfterDelete', target.name));
      await fire();
    }),
```

(No import changes needed — `deleteProfile`, `readProviders`, `t`, `vscode` are already imported.)

- [ ] **Step 4: Toast in the webview `providers:delete` handler**

In `src/webview/provider-panel.ts`, the current handler is:
```ts
      } else if (req.method === 'providers:delete') {
        await deleteProfile((req.params as { id: string }).id, secrets);
        fireRefresh();
        res = { id: req.id, result: 'ok' };
```
Replace with (capture the name before deleting, toast if it was active):
```ts
      } else if (req.method === 'providers:delete') {
        const delId = (req.params as { id: string }).id;
        const before = await readProviders(CLAUDE_HOME);
        const name = before.profiles.find(p => p.id === delId)?.name ?? '';
        const wasActive = await deleteProfile(delId, secrets);
        if (wasActive) vscode.window.showInformationMessage(t('providers.deactivatedAfterDelete', name));
        fireRefresh();
        res = { id: req.id, result: 'ok' };
```
(`readProviders`, `deleteProfile`, `vscode`, `t` are already imported in this file.)

- [ ] **Step 5: Verify**

Run:
```bash
pnpm build
pnpm test
node -e 'const en=require("./l10n/bundle.l10n.json"),zh=require("./l10n/bundle.l10n.zh-cn.json");for(const k of ["providers.delete.confirmActive","providers.deactivatedAfterDelete"])console.log(k, k in en, k in zh);'
```
Expected: build succeeds; `71 passing`; both keys `true true`.

- [ ] **Step 6: Commit**
```bash
git add src/lib/provider-apply.ts src/commands/providers.ts src/webview/provider-panel.ts l10n/bundle.l10n.json l10n/bundle.l10n.zh-cn.json
git commit -m "feat(providers): warn + toast when deleting the active profile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Manager modal polish (provider-app.ts)

**Files:**
- Modify: `webview-ui/src/provider-app.ts`
- Modify: `l10n/bundle.l10n.json`, `l10n/bundle.l10n.zh-cn.json`
- Modify: `src/webview/provider-panel.ts` (`PROVIDER_KEYS` whitelist)

- [ ] **Step 1: Add l10n keys to BOTH bundles**

`l10n/bundle.l10n.json`:
```
"providers.manage.deleteActiveConfirm": "Delete \"{0}\"? It's the active provider — deleting reverts to subscription mode.",
"providers.manage.secretSet": "A secret is saved — leave blank to keep it, or enter a new one to replace.",
"providers.manage.secretNone": "No secret saved yet.",
"providers.manage.newFromPreset": "New from preset: {0}",
```
`l10n/bundle.l10n.zh-cn.json`:
```
"providers.manage.deleteActiveConfirm": "删除「{0}」？它是当前活动接入方——删除将回退到订阅模式。",
"providers.manage.secretSet": "已保存一个凭证——留空保留，输入新值替换。",
"providers.manage.secretNone": "尚未保存凭证。",
"providers.manage.newFromPreset": "从预设新建：{0}",
```

- [ ] **Step 2: Whitelist the 4 new webview keys**

In `src/webview/provider-panel.ts`, the `PROVIDER_KEYS` array. Add these entries (next to the other `providers.manage.*` keys):
```ts
  'providers.manage.deleteActiveConfirm', 'providers.manage.secretSet',
  'providers.manage.secretNone', 'providers.manage.newFromPreset',
```

- [ ] **Step 3: Active-aware delete confirm in the webview**

In `webview-ui/src/provider-app.ts`, the `del` function is currently:
```ts
  async function del(p: Profile) {
    if (!confirm(t('providers.manage.deleteConfirm', p.name))) return;
    await call('providers:delete', { id: p.id });
    await load();
  }
```
Replace with (active-aware message; `data.active` is available on the loaded list):
```ts
  async function del(p: Profile) {
    const msg = data && p.id === data.active
      ? t('providers.manage.deleteActiveConfirm', p.name)
      : t('providers.manage.deleteConfirm', p.name);
    if (!confirm(msg)) return;
    await call('providers:delete', { id: p.id });
    await load();
  }
```

- [ ] **Step 4: Secret-set indicator + drop the vague placeholder**

In `renderForm()`, just after `const f = form;` add the editing-profile lookup and a helper:
```ts
    const editing = f.id ? data?.profiles.find(p => p.id === f.id) : undefined;
    const secretHint = (set: boolean) => f.id ? (set ? t('providers.manage.secretSet') : t('providers.manage.secretNone')) : '';
```
Then update the four secret fields to pass a hint (3rd arg of `fieldWrap`) and a non-explanatory placeholder. Replace these specific lines:

anthropic apiKey (currently):
```ts
      if (f.authMode === 'apiKey') body += fieldWrap(t('settings.env.apiKey'), inp('f-secret', f.secret, f.id ? t('providers.manage.secretUnchanged') : 'sk-ant-…', 'password'));
      else if (f.authMode === 'authToken') body += fieldWrap(t('settings.env.authToken'), inp('f-secret', f.secret, f.id ? t('providers.manage.secretUnchanged') : '…', 'password'));
```
become:
```ts
      if (f.authMode === 'apiKey') body += fieldWrap(t('settings.env.apiKey'), inp('f-secret', f.secret, f.id ? '' : 'sk-ant-…', 'password'), secretHint(!!editing && (editing as any).hasApiKey));
      else if (f.authMode === 'authToken') body += fieldWrap(t('settings.env.authToken'), inp('f-secret', f.secret, f.id ? '' : '…', 'password'), secretHint(!!editing && (editing as any).hasAuthToken));
```
bedrock (currently):
```ts
      body += fieldWrap(t('settings.env.bedrockToken'), inp('f-secret', f.secret, f.id ? t('providers.manage.secretUnchanged') : '…', 'password'));
```
becomes:
```ts
      body += fieldWrap(t('settings.env.bedrockToken'), inp('f-secret', f.secret, f.id ? '' : '…', 'password'), secretHint(!!editing && (editing as any).hasBearerToken));
```
foundry (currently):
```ts
      body += fieldWrap(t('settings.env.foundryApiKey'), inp('f-secret', f.secret, f.id ? t('providers.manage.secretUnchanged') : '…', 'password'));
```
becomes:
```ts
      body += fieldWrap(t('settings.env.foundryApiKey'), inp('f-secret', f.secret, f.id ? '' : '…', 'password'), secretHint(!!editing && (editing as any).hasApiKey));
```
(The `providers.manage.secretUnchanged` key is now unused in this file — that is expected; it stays in the bundle/whitelist, harmless. Do not remove it.)

- [ ] **Step 5: Preset title clarity**

In `renderForm()`, the title line is currently:
```ts
    const title = isPreset ? `⚡ ${esc(f.presetLabel!)}` : (f.id ? t('providers.manage.edit') : t('providers.manage.newAdvanced'));
```
Replace with:
```ts
    const title = isPreset ? esc(t('providers.manage.newFromPreset', f.presetLabel!)) : (f.id ? t('providers.manage.edit') : t('providers.manage.newAdvanced'));
```

- [ ] **Step 6: Name-required → disable Save (live)**

In `renderForm()`, the Save button is currently:
```ts
            <button id="f-save" class="px-3 py-1.5 rounded text-sm border-none bg-[var(--vscode-textLink-foreground)] text-white">${esc(isPreset ? t('providers.manage.addToLibrary') : t('providers.manage.save'))}</button>
```
Replace with (initial disabled state from current name + disabled styling):
```ts
            <button id="f-save" ${f.name.trim() ? '' : 'disabled'} class="px-3 py-1.5 rounded text-sm border-none bg-[var(--vscode-textLink-foreground)] text-white disabled:opacity-40 disabled:cursor-not-allowed">${esc(isPreset ? t('providers.manage.addToLibrary') : t('providers.manage.save'))}</button>
```
Then in `bindForm()`, the name input handler is currently:
```ts
    g<HTMLInputElement>('f-name')?.addEventListener('input', e => f.name = (e.target as HTMLInputElement).value);
```
Replace with (live-toggle Save disabled, no re-render so focus is kept):
```ts
    g<HTMLInputElement>('f-name')?.addEventListener('input', e => {
      f.name = (e.target as HTMLInputElement).value;
      const saveBtn = g<HTMLButtonElement>('f-save');
      if (saveBtn) saveBtn.disabled = !f.name.trim();
    });
```
(`save()` already guards `if (!form || !form.name.trim()) return;`, so the disabled button is belt-and-suspenders.)

- [ ] **Step 7: Verify**
```bash
pnpm build
cd webview-ui && pnpm exec tsc --noEmit && cd ..
pnpm test
node -e 'const en=require("./l10n/bundle.l10n.json"),zh=require("./l10n/bundle.l10n.zh-cn.json");const fs=require("fs");const panel=fs.readFileSync("src/webview/provider-panel.ts","utf8");for(const k of ["providers.manage.deleteActiveConfirm","providers.manage.secretSet","providers.manage.secretNone","providers.manage.newFromPreset"])console.log(k,"en",k in en,"zh",k in zh,"whitelist",panel.includes(k));'
```
Expected: build + tsc clean; `71 passing`; every key `en true zh true whitelist true`.

- [ ] **Step 8: Commit**
```bash
git add webview-ui/src/provider-app.ts l10n/bundle.l10n.json l10n/bundle.l10n.zh-cn.json src/webview/provider-panel.ts
git commit -m "feat(providers): manager modal — name required, secret-set hint, clearer preset title

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Remove dead/duplicate commands (`activateById`, `create`)

**Files:**
- Modify: `src/commands/providers.ts`
- Modify: `package.json`
- Modify: `package.nls.json`, `package.nls.zh-cn.json`

- [ ] **Step 1: Remove the two command registrations**

In `src/commands/providers.ts`, delete the entire `claudeCopilot.providers.create` registration block:
```ts
    vscode.commands.registerCommand('claudeCopilot.providers.create', async () => {
      await vscode.commands.executeCommand('claudeCopilot.openProviderPanel');
    }),
```
and the entire `claudeCopilot.providers.activateById` registration block:
```ts
    vscode.commands.registerCommand('claudeCopilot.providers.activateById', async (arg?: { id?: string | null }) => {
      let id: string | null = null;
      if (arg && typeof arg === 'object') {
        if (arg.id === '__subscription__') id = null;
        else if (typeof arg.id === 'string') id = arg.id;
        else if (arg.id === null) id = null;
      }
      await activateProfile(id, secrets);
      await fire();
    }),
```
After removal, the remaining registered commands are `quickSwitch`, `delete`, `edit`. Check whether `activateProfile` is still imported/used elsewhere in this file — it is NOT used after removing `activateById` (quickSwitch uses it at the activate branch — KEEP the import). Verify: `quickSwitch` still calls `activateProfile(...)`, so the `activateProfile` import stays. Do NOT remove that import.

- [ ] **Step 2: Remove the package.json command entries + commandPalette entry**

In `package.json` `contributes.commands`, delete these two lines:
```json
      { "command": "claudeCopilot.providers.create", "title": "%cmd.providers.create%", "icon": "$(add)" },
      { "command": "claudeCopilot.providers.activateById", "title": "%cmd.providers.activateById%" }
```
(Mind the trailing comma — after deletion, the line above must end correctly. The entry before `create` is the `providers.delete` line `{ ... "icon": "$(trash)" },` — it keeps its trailing comma; `providers.delete` becomes the last command in the array, so ensure it has NO trailing comma if it's now last, or keep the array valid. Simplest: the `providers.edit` and `providers.delete` lines remain; ensure the LAST remaining command entry has no trailing comma.)

In `package.json` `contributes.menus.commandPalette`, delete:
```json
        { "command": "claudeCopilot.providers.activateById", "when": "false" }
```
(The entry before it is `{ "command": "claudeCopilot.openFile", "when": "false" }` — after deletion it becomes the last item; remove its trailing comma so the array stays valid.)

- [ ] **Step 3: Remove the nls keys**

In `package.nls.json` delete the `"cmd.providers.create"` and `"cmd.providers.activateById"` entries. Do the same in `package.nls.zh-cn.json`. Keep `cmd.providers.edit`.

- [ ] **Step 4: Verify**
```bash
pnpm build
pnpm test
node -e 'JSON.parse(require("fs").readFileSync("package.json","utf8")); JSON.parse(require("fs").readFileSync("package.nls.json","utf8")); JSON.parse(require("fs").readFileSync("package.nls.zh-cn.json","utf8")); console.log("all JSON valid");'
echo "--- no dangling references ---"
grep -rn "providers.create\|providers.activateById\|__subscription__\|cmd.providers.create\|cmd.providers.activateById" src package.json package.nls.json package.nls.zh-cn.json || echo "none (good)"
```
Expected: build succeeds; `71 passing`; "all JSON valid"; grep prints "none (good)".

- [ ] **Step 5: Commit**
```bash
git add src/commands/providers.ts package.json package.nls.json package.nls.zh-cn.json
git commit -m "refactor(providers): remove dead activateById + duplicate create commands

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- §1 delete-active warning + toast → Task 1 (deleteProfile return, command confirm+toast, host toast) + Task 2 Step 3 (webview confirm). ✓
- §2 manager polish: name validation → T2 S6; secret-set indicator → T2 S4; preset title → T2 S5. ✓
- §3 simplification: remove `activateById` + `create` (and `__subscription__`), collapse double `readProviders` → Task 3 + Task 1 Step 3 (delete now reads once). ✓
- i18n: 2 host keys (T1) + 4 webview keys + whitelist (T2); nls deletions (T3). ✓
- Non-goals respected: no sidebar/status-bar/quickPick/RPC/per-layer changes; `providers.edit` kept. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full before/after. ✓

**3. Type consistency:** `deleteProfile` returns `Promise<boolean>` in Task 1 and both callers (command Task 1, host Task 1) consume the boolean; webview `del` (Task 2) doesn't use the return (fire-and-reload) — consistent. `secretHint(set: boolean)` defined and used with `editing` lookups matching the `Profile` flag names (`hasApiKey`/`hasAuthToken`/`hasBearerToken`) from `provider-app.ts`'s `Profile` interface. l10n key names identical across add/whitelist/verify steps. ✓
