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
