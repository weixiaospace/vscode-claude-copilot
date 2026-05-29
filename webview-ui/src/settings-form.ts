import { call } from './rpc';
import { t } from './l10n';
import {
  type Layer, type SettingsData, type FormState,
  settingsToForm, formToPartial, KNOWN_KEYS,
} from './settings-state';
import * as ui from './ui';
import { escapeHtml } from './ui';
import { SECTIONS, type Field, type SettingsSection } from './settings-schema';

interface State {
  layer: Layer;
  data: SettingsData | null;
  form: FormState | null;
  dirty: boolean;
  loading: boolean;
  saving: boolean;
  tagInput: Record<'allow' | 'deny' | 'ask' | 'dir', string>;
  showAdvancedEnv: boolean;
  activeSection: string;
  search: string;
}

const FIELD_BY_ID = new Map<string, Field>();
for (const sec of SECTIONS) for (const fld of sec.fields) FIELD_BY_ID.set(fld.id, fld);

// ==================== Render helpers ====================

let scrollObserver: IntersectionObserver | null = null;

export function mount(root: HTMLElement): void {
  const initialLayer = ((window as any).__layer as Layer) ?? 'user';
  const state: State = {
    layer: initialLayer, data: null, form: null, dirty: false, loading: false, saving: false,
    tagInput: { allow: '', deny: '', ask: '', dir: '' },
    showAdvancedEnv: false,
    activeSection: SECTIONS[0].id,
    search: '',
  };

  async function load() {
    state.loading = true; render();
    try {
      state.data = await call<SettingsData>('settings:read', { layer: state.layer });
      state.form = settingsToForm(state.data.settings, state.data.installedPlugins);
      state.dirty = false;
    } catch (err: any) {
      console.error('settings:read failed', err);
    } finally {
      state.loading = false; render();
    }
  }

  async function save() {
    if (!state.form) return;
    state.saving = true; render();
    try {
      const partial = formToPartial(state.form);
      await call('settings:write', {
        layer: state.layer,
        partial,
        knownKeys: KNOWN_KEYS,
      });
      state.dirty = false;
      await load();
    } catch (err: any) {
      console.error('settings:write failed', err);
      alert(t('settings.saveFailed') + ': ' + (err?.message || err));
    } finally {
      state.saving = false; render();
    }
  }

  function reset() {
    if (!state.data) return;
    state.form = settingsToForm(state.data.settings, state.data.installedPlugins);
    state.dirty = false;
    state.tagInput = { allow: '', deny: '', ask: '', dir: '' };
    render();
  }

  function openJson() { call('settings:openJson', { layer: state.layer }).catch(() => {}); }

  function switchLayer(next: Layer) {
    if (state.dirty && !confirm(t('settings.unsavedChanges'))) return;
    state.layer = next; state.data = null; state.form = null; load();
  }

  function markDirty() { state.dirty = true; }

  const LAYER_LABEL: Record<Layer, string> = {
    get user() { return t('tree.group.user'); },
    get project() { return t('tree.group.project'); },
    get local() { return t('tree.layer.local'); },
  };
  const LAYER_FILE: Record<Layer, string> = {
    user: '~/.claude/settings.json',
    project: '.claude/settings.json',
    local: '.claude/settings.local.json',
  };

  function renderLayerBadge(): string {
    return `
      <div class="flex items-center gap-2 text-sm">
        <span class="opacity-60">${escapeHtml(t('settings.editingLayer'))}</span>
        <span class="inline-flex items-center gap-2 rounded border border-current/25 bg-current/10 px-2.5 py-1 font-medium">
          ${escapeHtml(LAYER_LABEL[state.layer])}
          <span class="opacity-55 font-mono text-xs">${escapeHtml(LAYER_FILE[state.layer])}</span>
        </span>
      </div>`;
  }

  function renderTagList(kind: 'allow' | 'deny' | 'ask' | 'dir', items: string[], inputValue: string, placeholder: string): string {
    const tags = items.map((item, i) => `
      <span class="inline-flex items-center gap-1 text-xs rounded border border-current/25 bg-current/5 px-2 py-0.5 font-mono">
        <span>${escapeHtml(item)}</span>
        <button data-${kind}-remove="${i}" class="opacity-60 hover:opacity-100 hover:text-red-500 leading-none">×</button>
      </span>
    `).join('');
    return `
      <div class="space-y-2">
        <div class="flex flex-wrap gap-1.5 min-h-6">${tags || `<span class="text-xs opacity-50">${t('settings.permissions.empty')}</span>`}</div>
        <div class="flex gap-2">
          <input type="text" data-${kind}-input value="${escapeHtml(inputValue)}" placeholder="${escapeHtml(placeholder)}"
            class="flex-1 bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />
          <button data-${kind}-add class="text-xs px-3 py-1 border border-current/20 rounded hover:bg-current/5 whitespace-nowrap">+ ${t('settings.permissions.add')}</button>
        </div>
      </div>
    `;
  }

  function renderEnvCustom(): string {
    if (!state.form) return '';
    const rows = state.form.envCustom.map((e, i) => `
      <div class="flex gap-2 items-center">
        <input type="text" data-envc-key="${i}" value="${escapeHtml(e.key)}" placeholder="KEY"
          class="flex-1 bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />
        <span class="opacity-60">=</span>
        <input type="text" data-envc-value="${i}" value="${escapeHtml(e.value)}" placeholder="VALUE"
          class="flex-[2] bg-transparent border border-current/20 rounded px-2 py-1 text-sm font-mono" />
        <button data-envc-remove="${i}" class="text-xs px-2 py-1 opacity-60 hover:opacity-100">×</button>
      </div>
    `).join('');
    return rows + `<button id="envc-add" class="text-xs px-3 py-1 border border-current/20 rounded hover:bg-current/5">+ ${t('settings.envAdd')}</button>`;
  }

  function renderPluginList(): string {
    if (!state.form || !state.data) return '';
    if (state.data.installedPlugins.length === 0) return `<div class="text-xs opacity-60">${t('settings.noPlugins')}</div>`;
    return state.data.installedPlugins.map(p => `
      <label class="flex items-center gap-2 text-sm py-0.5">
        <input type="checkbox" data-plugin="${escapeHtml(p.key)}" ${state.form!.enabledPlugins[p.key] ? 'checked' : ''} />
        <span>${escapeHtml(p.name)}</span>
        <span class="text-xs opacity-50">(${escapeHtml(p.marketplace)})</span>
      </label>
    `).join('');
  }

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

  function renderField(fld: Field, f: FormState): string {
    if (fld.kind === 'custom') {
      return fld.id === 'plugins'
        ? `<div class="space-y-1">${renderPluginList()}</div><div class="text-[11px] opacity-50 mt-2">${t('settings.pluginsHint')}</div>`
        : (state.showAdvancedEnv
            ? `<div class="space-y-2">${renderEnvCustom()}</div>`
            : ui.button({ id: 'show-advanced', label: `${t('settings.advanced.show')} (${f.envCustom.length})`, size: 'sm' }));
    }
    const label = t(fld.labelKey);
    const hint = ('descRaw' in fld && fld.descRaw) ? fld.descRaw : (fld.descKey ? t(fld.descKey) : '');
    switch (fld.kind) {
      case 'switch':
        return ui.switchRow({ id: fld.id, checked: fld.get(f), label, desc: hint });
      case 'toggleGroup':
        return ui.field({ label, hint, control: ui.toggleGroup({ id: fld.id, options: fld.options(), active: fld.get(f) }) });
      case 'select':
        return ui.field({ label, hint, control: ui.select({ id: fld.id, options: fld.options().map(o => ({ ...o, selected: o.value === fld.get(f) })) }) });
      case 'number':
        return ui.field({ label, hint, control: ui.numberInput({ attr: `data-num="${fld.id}"`, value: fld.get(f) }) });
      case 'text':
        return ui.field({ label, hint, control: ui.textInput({ id: fld.id, value: fld.get(f), placeholder: fld.placeholder }) });
      case 'tagList':
        return ui.field({ label, hint, control: renderTagList(fld.id, fld.getList(f), state.tagInput[fld.id], fld.placeholder) });
    }
  }

  function renderSectionBody(sec: SettingsSection, f: FormState): string {
    return sec.fields.map(fld => renderField(fld, f)).join(sec.id === 'flags' ? '<div class="border-t border-current/10 my-1"></div>' : '');
  }

  function renderForm(): string {
    if (!state.form || !state.data) return '';
    const f = state.form;
    return SECTIONS.map(sec => `
      <section id="sec-${sec.id}" data-section="${sec.id}" class="rounded-lg border border-current/15 p-5 space-y-4 scroll-mt-4">
        ${ui.sectionHeader(t(sec.labelKey), sec.descKey ? t(sec.descKey) : undefined)}
        ${renderSectionBody(sec, f)}
      </section>`).join('');
  }

  function commitTag(kind: 'allow' | 'deny' | 'ask' | 'dir') {
    if (!state.form) return;
    const val = state.tagInput[kind].trim();
    if (!val) return;
    const list = kind === 'allow' ? state.form.permAllow : kind === 'deny' ? state.form.permDeny : kind === 'ask' ? state.form.permAsk : state.form.permAdditionalDirs;
    if (list.includes(val)) return;
    list.push(val);
    state.tagInput[kind] = '';
    markDirty(); render();
  }

  function renderNav(): string {
    return `<nav class="space-y-0.5">${SECTIONS.map(sec => `
      <button data-nav="${sec.id}" class="w-full text-left text-sm px-2 py-1.5 rounded transition-colors ${
        state.activeSection === sec.id ? 'bg-current/10 font-medium' : 'opacity-70 hover:bg-current/5'}">
        ${escapeHtml(t(sec.labelKey))}
      </button>`).join('')}</nav>`;
  }

  function render() {
    if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }
    if (!state.form || !state.data) {
      root.innerHTML = `<div class="p-6 text-sm opacity-70">${state.loading ? t('common.loading') : t('common.preparing')}</div>`;
      return;
    }
    root.innerHTML = `
      <div class="flex flex-col h-screen">
        <header class="shrink-0 border-b border-current/15 px-5 py-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            ${renderLayerBadge()}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            ${state.dirty ? `<span class="text-xs px-2 py-0.5 rounded border border-current/30 opacity-80">${t('settings.unsaved')}</span>` : ''}
          </div>
        </header>
        <div class="flex-1 flex min-h-0">
          <aside class="w-48 shrink-0 border-r border-current/15 p-3 overflow-y-auto space-y-3">
            <input id="settings-search" type="text" placeholder="${escapeHtml(t('settings.search'))}" value="${escapeHtml(state.search)}"
              class="w-full bg-transparent border border-current/20 rounded px-2 py-1 text-sm" />
            ${renderNav()}
          </aside>
          <main id="settings-scroll" class="flex-1 overflow-y-auto p-5 space-y-4">
            ${renderProviderSelect()}
            <div class="space-y-4">${renderForm()}</div>
          </main>
        </div>
        <footer class="shrink-0 flex gap-2 px-5 py-2 border-t border-current/15 bg-[var(--vscode-editor-background)]">
          ${ui.button({ id: 'save-btn', label: state.saving ? t('settings.saving') : t('settings.save'), variant: 'primary', disabled: state.saving || !state.dirty })}
          ${ui.button({ id: 'reset-btn', label: t('settings.reset'), variant: 'secondary', disabled: !state.dirty })}
          <div class="flex-1"></div>
          ${ui.button({ id: 'json-btn', label: t('settings.editJson'), variant: 'ghost' })}
        </footer>
      </div>`;
    bind();
    bindNav();
  }

  function bindNav() {
    root.querySelectorAll<HTMLButtonElement>('button[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.nav!;
        state.activeSection = id;
        root.querySelector(`#sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        root.querySelectorAll<HTMLButtonElement>('button[data-nav]').forEach(b => {
          const on = b.dataset.nav === id;
          b.classList.toggle('bg-current/10', on);
          b.classList.toggle('font-medium', on);
          b.classList.toggle('opacity-70', !on);
        });
      });
    });

    const scroller = root.querySelector<HTMLElement>('#settings-scroll');
    if (scroller) {
      scrollObserver = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = (e.target as HTMLElement).dataset.section!;
            state.activeSection = id;
            root.querySelectorAll<HTMLButtonElement>('button[data-nav]').forEach(b => {
              const on = b.dataset.nav === id;
              b.classList.toggle('bg-current/10', on);
              b.classList.toggle('font-medium', on);
              b.classList.toggle('opacity-70', !on);
            });
          }
        }
      }, { root: scroller, rootMargin: '0px 0px -70% 0px', threshold: 0 });
      root.querySelectorAll<HTMLElement>('section[data-section]').forEach(s => scrollObserver!.observe(s));
    }
  }

  function bind() {
    const f = state.form!;

    // toggle groups
    root.querySelectorAll<HTMLElement>('[data-toggle]').forEach(group => {
      const fld = FIELD_BY_ID.get(group.dataset.toggle!);
      if (!fld || fld.kind !== 'toggleGroup') return;
      group.querySelectorAll<HTMLButtonElement>('button[data-val]').forEach(btn => {
        btn.addEventListener('click', () => { fld.set(f, btn.dataset.val!); markDirty(); render(); });
      });
    });

    // switches
    for (const fld of FIELD_BY_ID.values()) {
      if (fld.kind !== 'switch') continue;
      root.querySelector<HTMLInputElement>('#' + fld.id)?.addEventListener('change', e => {
        fld.set(f, (e.target as HTMLInputElement).checked); markDirty(); render();
      });
    }

    // selects (re-render to mirror legacy model/language behavior)
    for (const fld of FIELD_BY_ID.values()) {
      if (fld.kind !== 'select') continue;
      root.querySelector<HTMLSelectElement>('#' + fld.id)?.addEventListener('change', e => {
        fld.set(f, (e.target as HTMLSelectElement).value); markDirty(); render();
      });
    }

    // text inputs (no re-render — preserve focus while typing)
    for (const fld of FIELD_BY_ID.values()) {
      if (fld.kind !== 'text') continue;
      root.querySelector<HTMLInputElement>('#' + fld.id)?.addEventListener('input', e => {
        fld.set(f, (e.target as HTMLInputElement).value); markDirty();
      });
    }

    // number inputs (no re-render)
    root.querySelectorAll<HTMLInputElement>('input[data-num]').forEach(inp => {
      const fld = FIELD_BY_ID.get(inp.dataset.num!);
      if (!fld || fld.kind !== 'number') return;
      inp.addEventListener('input', () => {
        const v = inp.value.trim();
        fld.set(f, v === '' ? '' : Number(v)); markDirty();
      });
    });

    // tag lists
    for (const kind of ['allow', 'deny', 'ask', 'dir'] as const) {
      const input = root.querySelector<HTMLInputElement>(`input[data-${kind}-input]`);
      input?.addEventListener('input', () => { state.tagInput[kind] = input.value; });
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitTag(kind); } });
      root.querySelector<HTMLButtonElement>(`button[data-${kind}-add]`)?.addEventListener('click', () => commitTag(kind));
      root.querySelectorAll<HTMLButtonElement>(`button[data-${kind}-remove]`).forEach(btn => {
        btn.addEventListener('click', () => {
          const i = Number(btn.dataset[`${kind}Remove`]);
          const list = kind === 'allow' ? f.permAllow : kind === 'deny' ? f.permDeny : kind === 'ask' ? f.permAsk : f.permAdditionalDirs;
          list.splice(i, 1); markDirty(); render();
        });
      });
    }

    root.querySelectorAll<HTMLInputElement>('input[data-plugin]').forEach(cb => {
      cb.addEventListener('change', () => { f.enabledPlugins[cb.dataset.plugin!] = cb.checked; markDirty(); });
    });

    root.querySelector<HTMLButtonElement>('#show-advanced')?.addEventListener('click', () => { state.showAdvancedEnv = true; render(); });
    root.querySelectorAll<HTMLInputElement>('input[data-envc-key]').forEach(inp => {
      inp.addEventListener('input', () => { f.envCustom[Number(inp.dataset.envcKey)]!.key = inp.value; markDirty(); });
    });
    root.querySelectorAll<HTMLInputElement>('input[data-envc-value]').forEach(inp => {
      inp.addEventListener('input', () => { f.envCustom[Number(inp.dataset.envcValue)]!.value = inp.value; markDirty(); });
    });
    root.querySelectorAll<HTMLButtonElement>('button[data-envc-remove]').forEach(btn => {
      btn.addEventListener('click', () => { f.envCustom.splice(Number(btn.dataset.envcRemove), 1); markDirty(); render(); });
    });
    root.querySelector<HTMLButtonElement>('#envc-add')?.addEventListener('click', () => {
      f.envCustom.push({ key: '', value: '' }); markDirty(); render();
    });

    root.querySelector<HTMLButtonElement>('#save-btn')?.addEventListener('click', () => save());
    root.querySelector<HTMLButtonElement>('#reset-btn')?.addEventListener('click', () => reset());
    root.querySelector<HTMLButtonElement>('#json-btn')?.addEventListener('click', () => openJson());

    root.querySelector<HTMLSelectElement>('#layer-provider')?.addEventListener('change', async (e) => {
      const id = (e.target as HTMLSelectElement).value || null;
      await call('settings:setLayerProvider', { layer: state.layer, id });
      await load();
    });
  }

  window.addEventListener('message', (e) => {
    const msg = e.data as { push?: string; layer?: Layer };
    if (msg?.push === 'layer:set' && msg.layer && msg.layer !== state.layer) {
      switchLayer(msg.layer);
    }
  });

  load();
}
