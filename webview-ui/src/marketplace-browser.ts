import { call } from './rpc';
import { t } from './l10n';

interface AvailablePlugin {
  name: string;
  description: string;
  marketplace: string;
  category?: string;
  homepage?: string;
}

interface InstalledPlugin {
  name: string;
  marketplace: string;
  version: string;
  enabled: boolean;
}

interface MarketplaceData {
  available: AvailablePlugin[];
  installed: InstalledPlugin[];
  marketplaces: string[];
}

interface State {
  data: MarketplaceData | null;
  search: string;
  marketplaceFilter: 'all' | string;
  busy: Set<string>; // plugin keys currently installing/uninstalling
  loading: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function pluginKey(p: { name: string; marketplace: string }): string {
  return `${p.name}@${p.marketplace}`;
}

export function mount(root: HTMLElement): void {
  const state: State = {
    data: null,
    search: '',
    marketplaceFilter: 'all',
    busy: new Set(),
    loading: false,
  };

  async function load() {
    state.loading = true;
    render();
    try {
      state.data = await call<MarketplaceData>('marketplace:list');
    } catch (err: any) {
      console.error('marketplace:list failed', err);
      state.data = { available: [], installed: [], marketplaces: [] };
    } finally {
      state.loading = false;
      render();
    }
  }

  async function installPlugin(p: AvailablePlugin) {
    const key = pluginKey(p);
    state.busy.add(key);
    render();
    try {
      await call('marketplace:install', { name: p.name, marketplace: p.marketplace });
      await load();
    } catch (err: any) {
      console.error(err);
      state.busy.delete(key);
      render();
    }
  }

  async function uninstallPlugin(p: InstalledPlugin) {
    const key = pluginKey(p);
    state.busy.add(key);
    render();
    try {
      await call('marketplace:uninstall', { name: p.name, marketplace: p.marketplace });
      await load();
    } catch (err: any) {
      console.error(err);
      state.busy.delete(key);
      render();
    }
  }

  function getInstalled(name: string, marketplace: string): InstalledPlugin | undefined {
    return state.data?.installed.find(i => i.name === name && i.marketplace === marketplace);
  }

  function filteredPlugins(): AvailablePlugin[] {
    if (!state.data) return [];
    const q = state.search.toLowerCase().trim();
    return state.data.available.filter(p => {
      if (state.marketplaceFilter !== 'all' && p.marketplace !== state.marketplaceFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    });
  }

  function renderCard(p: AvailablePlugin): string {
    const key = pluginKey(p);
    const installed = getInstalled(p.name, p.marketplace);
    const busy = state.busy.has(key);
    const btnLabel = busy ? '...' : (installed ? t('marketplace.uninstall') : t('marketplace.install'));
    const btnAction = busy ? 'busy' : (installed ? 'uninstall' : 'install');
    return `
      <div class="border border-current/15 rounded-lg p-4 flex flex-col min-h-32">
        <div class="flex items-start justify-between gap-2 mb-1">
          <div class="font-semibold text-sm truncate">${escapeHtml(p.name)}</div>
          ${installed ? `<span class="text-[10px] px-1.5 py-0.5 rounded border border-current/30 opacity-80">v${escapeHtml(installed.version)}</span>` : ''}
        </div>
        <div class="text-[11px] opacity-60 mb-2">${escapeHtml(p.marketplace)}</div>
        <div class="text-xs opacity-80 flex-1 line-clamp-3">${escapeHtml(p.description || t('marketplace.noDescription'))}</div>
        <div class="mt-3 flex justify-end">
          <button
            data-action="${btnAction}"
            data-name="${escapeHtml(p.name)}"
            data-marketplace="${escapeHtml(p.marketplace)}"
            ${busy ? 'disabled' : ''}
            class="text-xs px-3 py-1 rounded border border-current/30 hover:bg-current/10 disabled:opacity-50">
            ${btnLabel}
          </button>
        </div>
      </div>
    `;
  }

  function render() {
    const { data, search, marketplaceFilter, loading } = state;
    if (!data) {
      root.innerHTML = `<div class="p-6 text-sm opacity-70">${t('common.loading')}</div>`;
      return;
    }
    const items = filteredPlugins();
    const mpOptions = ['all', ...data.marketplaces];
    root.innerHTML = `
      <div class="p-6 max-w-6xl mx-auto space-y-4">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-semibold">🏪 ${t('marketplace.title')}</h1>
          <button id="refresh-btn" ${loading ? 'disabled' : ''}
            class="border border-current/20 rounded px-3 py-1 text-sm disabled:opacity-50">
            ${loading ? '...' : t('common.refresh')}
          </button>
        </div>

        <div class="flex gap-3 items-center">
          <input id="search-input" type="text" placeholder="${t('marketplace.searchPlaceholder')}" value="${escapeHtml(search)}"
            class="flex-1 bg-transparent border border-current/20 rounded px-3 py-1.5 text-sm" />
          <select id="mp-filter" class="bg-transparent border border-current/20 rounded px-2 py-1.5 text-sm">
            ${mpOptions.map(m => `<option value="${escapeHtml(m)}" ${marketplaceFilter === m ? 'selected' : ''}>${m === 'all' ? t('marketplace.allMarketplaces') : escapeHtml(m)}</option>`).join('')}
          </select>
        </div>

        <div class="text-xs opacity-60">${t('marketplace.pluginCount', items.length)}${data.available.length !== items.length ? ` / ${t('marketplace.totalCount', data.available.length)}` : ''}</div>

        ${items.length === 0
          ? `<div class="text-center py-16 opacity-60 text-sm">
              ${data.marketplaces.length === 0
                ? t('marketplace.noMarketplace')
                : t('marketplace.noMatch')}
             </div>`
          : `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
               ${items.map(renderCard).join('')}
             </div>`}
      </div>
    `;

    const searchInput = root.querySelector<HTMLInputElement>('#search-input');
    const mpFilter = root.querySelector<HTMLSelectElement>('#mp-filter');
    const refreshBtn = root.querySelector<HTMLButtonElement>('#refresh-btn');

    searchInput?.addEventListener('input', () => {
      state.search = searchInput.value;
      render();
    });
    mpFilter?.addEventListener('change', () => {
      state.marketplaceFilter = mpFilter.value;
      render();
    });
    refreshBtn?.addEventListener('click', () => load());

    root.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const name = btn.dataset.name!;
        const marketplace = btn.dataset.marketplace!;
        if (action === 'install') {
          const p = state.data?.available.find(a => a.name === name && a.marketplace === marketplace);
          if (p) installPlugin(p);
        } else if (action === 'uninstall') {
          const p = state.data?.installed.find(i => i.name === name && i.marketplace === marketplace);
          if (p) uninstallPlugin(p);
        }
      });
    });
  }

  load();
}
