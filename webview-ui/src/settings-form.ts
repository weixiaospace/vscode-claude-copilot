import { call } from './rpc';

type Layer = 'user' | 'project' | 'local';

interface LayerAvailability {
  user: boolean;
  project: boolean;
  local: boolean;
}

interface InstalledPluginSummary {
  key: string; // "name@marketplace"
  name: string;
  marketplace: string;
}

interface SettingsData {
  layer: Layer;
  settings: Record<string, unknown>;
  availableLayers: LayerAvailability;
  installedPlugins: InstalledPluginSummary[];
}

interface FormState {
  model: string;
  permissionMode: string;
  enabledPlugins: Record<string, boolean>;
  env: Array<{ key: string; value: string }>;
  includeCoAuthoredBy: boolean;
  cleanupPeriodDays: number | '';
}

interface State {
  layer: Layer;
  data: SettingsData | null;
  form: FormState | null;
  dirty: boolean;
  loading: boolean;
  saving: boolean;
}

const MODELS = ['', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
const PERMISSION_MODES = ['', 'default', 'plan', 'acceptEdits', 'bypassPermissions'];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function settingsToForm(settings: Record<string, unknown>, installedPlugins: InstalledPluginSummary[]): FormState {
  const envObj = (settings.env ?? {}) as Record<string, string>;
  const enabledPluginsObj = (settings.enabledPlugins ?? {}) as Record<string, boolean>;
  const enabled: Record<string, boolean> = {};
  for (const p of installedPlugins) {
    enabled[p.key] = enabledPluginsObj[p.key] !== false;
  }
  return {
    model: typeof settings.model === 'string' ? settings.model : '',
    permissionMode: typeof settings.permissionMode === 'string' ? settings.permissionMode : '',
    enabledPlugins: enabled,
    env: Object.entries(envObj).map(([key, value]) => ({ key, value: String(value) })),
    includeCoAuthoredBy: settings.includeCoAuthoredBy !== false,
    cleanupPeriodDays: typeof settings.cleanupPeriodDays === 'number' ? settings.cleanupPeriodDays : '',
  };
}

function formToPartial(form: FormState): Record<string, unknown> {
  const partial: Record<string, unknown> = {};
  if (form.model) partial.model = form.model;
  if (form.permissionMode) partial.permissionMode = form.permissionMode;

  // enabledPlugins: only include plugins where user explicitly unchecked (false),
  // mirroring how CLI treats missing keys as enabled.
  const enabledPlugins: Record<string, boolean> = {};
  let hasOverride = false;
  for (const [key, value] of Object.entries(form.enabledPlugins)) {
    if (!value) {
      enabledPlugins[key] = false;
      hasOverride = true;
    }
  }
  if (hasOverride) partial.enabledPlugins = enabledPlugins;

  // env: only include non-empty keys
  const env: Record<string, string> = {};
  for (const { key, value } of form.env) {
    if (key.trim()) env[key.trim()] = value;
  }
  if (Object.keys(env).length > 0) partial.env = env;

  if (!form.includeCoAuthoredBy) partial.includeCoAuthoredBy = false;
  if (typeof form.cleanupPeriodDays === 'number') partial.cleanupPeriodDays = form.cleanupPeriodDays;

  return partial;
}

export function mount(root: HTMLElement): void {
  const state: State = {
    layer: 'user',
    data: null,
    form: null,
    dirty: false,
    loading: false,
    saving: false,
  };

  async function load() {
    state.loading = true;
    render();
    try {
      state.data = await call<SettingsData>('settings:read', { layer: state.layer });
      state.form = settingsToForm(state.data.settings, state.data.installedPlugins);
      state.dirty = false;
    } catch (err: any) {
      console.error('settings:read failed', err);
    } finally {
      state.loading = false;
      render();
    }
  }

  async function save() {
    if (!state.form) return;
    state.saving = true;
    render();
    try {
      const partial = formToPartial(state.form);
      await call('settings:write', {
        layer: state.layer,
        partial,
        knownKeys: ['model', 'permissionMode', 'enabledPlugins', 'env', 'includeCoAuthoredBy', 'cleanupPeriodDays'],
      });
      state.dirty = false;
      await load();
    } catch (err: any) {
      console.error('settings:write failed', err);
      alert('保存失败：' + (err?.message || err));
    } finally {
      state.saving = false;
      render();
    }
  }

  function reset() {
    if (!state.data) return;
    state.form = settingsToForm(state.data.settings, state.data.installedPlugins);
    state.dirty = false;
    render();
  }

  function openJson() {
    call('settings:openJson', { layer: state.layer }).catch(() => {});
  }

  function switchLayer(next: Layer) {
    if (state.dirty) {
      const ok = confirm('有未保存的更改，确认切换？');
      if (!ok) return;
    }
    state.layer = next;
    state.data = null;
    state.form = null;
    load();
  }

  function markDirty() {
    state.dirty = true;
  }

  function renderTabs(): string {
    const layers: Array<{ key: Layer; label: string }> = [
      { key: 'user', label: 'User' },
      { key: 'project', label: 'Project' },
      { key: 'local', label: 'Local' },
    ];
    return layers.map(l => {
      const active = state.layer === l.key;
      const avail = state.data?.availableLayers[l.key] ?? true;
      const cls = active
        ? 'border-b-2 border-current px-4 py-2 text-sm font-medium'
        : `px-4 py-2 text-sm ${avail ? 'opacity-60 hover:opacity-100' : 'opacity-30 cursor-not-allowed'}`;
      const disabled = !avail ? 'disabled' : '';
      return `<button data-layer="${l.key}" class="${cls}" ${disabled}>${l.label}${!avail ? ' (no workspace)' : ''}</button>`;
    }).join('');
  }

  function renderEnvRows(): string {
    if (!state.form) return '';
    const rows = state.form.env.map((e, i) => `
      <div class="flex gap-2 items-center">
        <input type="text" data-env-key="${i}" value="${escapeHtml(e.key)}" placeholder="KEY"
          class="flex-1 bg-transparent border border-current/20 rounded px-2 py-1 text-sm" />
        <span class="opacity-60">=</span>
        <input type="text" data-env-value="${i}" value="${escapeHtml(e.value)}" placeholder="VALUE"
          class="flex-2 flex-grow bg-transparent border border-current/20 rounded px-2 py-1 text-sm" />
        <button data-env-remove="${i}" class="text-xs px-2 py-1 opacity-60 hover:opacity-100">×</button>
      </div>
    `).join('');
    return rows + `
      <button id="env-add" class="text-xs px-3 py-1 border border-current/20 rounded mt-2 hover:bg-current/10">+ 添加</button>
    `;
  }

  function renderPluginList(): string {
    if (!state.form || !state.data) return '';
    if (state.data.installedPlugins.length === 0) {
      return `<div class="text-xs opacity-60">当前还没装任何插件</div>`;
    }
    return state.data.installedPlugins.map(p => `
      <label class="flex items-center gap-2 text-sm py-0.5">
        <input type="checkbox" data-plugin="${escapeHtml(p.key)}" ${state.form!.enabledPlugins[p.key] ? 'checked' : ''} />
        <span>${escapeHtml(p.name)}</span>
        <span class="text-xs opacity-50">(${escapeHtml(p.marketplace)})</span>
      </label>
    `).join('');
  }

  function renderForm(): string {
    if (!state.form || !state.data) return '';
    const f = state.form;
    return `
      <div class="space-y-5">
        <section>
          <div class="text-xs uppercase tracking-wider opacity-60 mb-2">默认模型</div>
          <select id="f-model" class="w-full bg-transparent border border-current/20 rounded px-2 py-1.5 text-sm">
            ${MODELS.map(m => `<option value="${m}" ${f.model === m ? 'selected' : ''}>${m || '(不覆盖 / 使用系统默认)'}</option>`).join('')}
          </select>
        </section>

        <section>
          <div class="text-xs uppercase tracking-wider opacity-60 mb-2">权限模式</div>
          <select id="f-permissionMode" class="w-full bg-transparent border border-current/20 rounded px-2 py-1.5 text-sm">
            ${PERMISSION_MODES.map(m => `<option value="${m}" ${f.permissionMode === m ? 'selected' : ''}>${m || '(不覆盖)'}</option>`).join('')}
          </select>
        </section>

        <section>
          <div class="text-xs uppercase tracking-wider opacity-60 mb-2">启用的插件</div>
          <div class="space-y-1">${renderPluginList()}</div>
          <div class="text-[11px] opacity-50 mt-1">未勾选的会写入 <code>enabledPlugins: {"x": false}</code></div>
        </section>

        <section>
          <div class="text-xs uppercase tracking-wider opacity-60 mb-2">环境变量</div>
          <div class="space-y-2" id="env-rows">${renderEnvRows()}</div>
        </section>

        <section>
          <div class="text-xs uppercase tracking-wider opacity-60 mb-2">其他</div>
          <label class="flex items-center gap-2 text-sm py-1">
            <input type="checkbox" id="f-coauthored" ${f.includeCoAuthoredBy ? 'checked' : ''} />
            <span>包含 Co-authored-by 行（git commit）</span>
          </label>
          <div class="flex items-center gap-2 text-sm py-1">
            <label for="f-cleanup">会话清理天数</label>
            <input type="number" id="f-cleanup" value="${f.cleanupPeriodDays === '' ? '' : f.cleanupPeriodDays}" min="0"
              class="w-20 bg-transparent border border-current/20 rounded px-2 py-1 text-sm" />
          </div>
        </section>
      </div>
    `;
  }

  function render() {
    if (!state.form || !state.data) {
      root.innerHTML = `<div class="p-6 text-sm opacity-70">${state.loading ? '加载中...' : '准备中...'}</div>`;
      return;
    }
    root.innerHTML = `
      <div class="p-6 max-w-3xl mx-auto space-y-5">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-semibold">⚙️ Settings</h1>
          ${state.dirty ? '<span class="text-xs px-2 py-0.5 rounded border border-current/30 opacity-80">未保存</span>' : ''}
        </div>

        <div class="flex border-b border-current/15">
          ${renderTabs()}
        </div>

        ${renderForm()}

        <div class="flex gap-2 pt-3 border-t border-current/10">
          <button id="save-btn" ${state.saving || !state.dirty ? 'disabled' : ''}
            class="px-4 py-1.5 rounded text-sm border border-current/40 bg-current/10 hover:bg-current/20 disabled:opacity-40">
            ${state.saving ? '保存中...' : '保存'}
          </button>
          <button id="reset-btn" ${state.dirty ? '' : 'disabled'}
            class="px-4 py-1.5 rounded text-sm border border-current/20 hover:bg-current/10 disabled:opacity-40">
            重置
          </button>
          <div class="flex-1"></div>
          <button id="json-btn" class="px-4 py-1.5 rounded text-sm opacity-70 hover:opacity-100">
            以 JSON 编辑 →
          </button>
        </div>
      </div>
    `;

    root.querySelectorAll<HTMLButtonElement>('button[data-layer]').forEach(btn => {
      btn.addEventListener('click', () => switchLayer(btn.dataset.layer as Layer));
    });

    const model = root.querySelector<HTMLSelectElement>('#f-model');
    model?.addEventListener('change', () => { state.form!.model = model.value; markDirty(); render(); });

    const pmode = root.querySelector<HTMLSelectElement>('#f-permissionMode');
    pmode?.addEventListener('change', () => { state.form!.permissionMode = pmode.value; markDirty(); render(); });

    root.querySelectorAll<HTMLInputElement>('input[data-plugin]').forEach(cb => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.plugin!;
        state.form!.enabledPlugins[key] = cb.checked;
        markDirty();
      });
    });

    root.querySelectorAll<HTMLInputElement>('input[data-env-key]').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = Number(inp.dataset.envKey);
        state.form!.env[i]!.key = inp.value;
        markDirty();
      });
    });
    root.querySelectorAll<HTMLInputElement>('input[data-env-value]').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = Number(inp.dataset.envValue);
        state.form!.env[i]!.value = inp.value;
        markDirty();
      });
    });
    root.querySelectorAll<HTMLButtonElement>('button[data-env-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.envRemove);
        state.form!.env.splice(i, 1);
        markDirty();
        render();
      });
    });
    root.querySelector<HTMLButtonElement>('#env-add')?.addEventListener('click', () => {
      state.form!.env.push({ key: '', value: '' });
      markDirty();
      render();
    });

    const coauthored = root.querySelector<HTMLInputElement>('#f-coauthored');
    coauthored?.addEventListener('change', () => { state.form!.includeCoAuthoredBy = coauthored.checked; markDirty(); });

    const cleanup = root.querySelector<HTMLInputElement>('#f-cleanup');
    cleanup?.addEventListener('input', () => {
      const v = cleanup.value.trim();
      state.form!.cleanupPeriodDays = v === '' ? '' : Number(v);
      markDirty();
    });

    root.querySelector<HTMLButtonElement>('#save-btn')?.addEventListener('click', () => save());
    root.querySelector<HTMLButtonElement>('#reset-btn')?.addEventListener('click', () => reset());
    root.querySelector<HTMLButtonElement>('#json-btn')?.addEventListener('click', () => openJson());
  }

  load();
}
