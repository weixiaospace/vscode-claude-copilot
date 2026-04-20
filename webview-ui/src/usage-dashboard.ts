import { call } from './rpc';
import { t } from './l10n';
import type { UsageResult, DailyUsage, ModelUsage } from './types';

const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheCreate: number }> = {
  'claude-opus-4-7':   { input: 15, output: 75, cacheRead: 1.5, cacheCreate: 18.75 },
  'claude-sonnet-4-6': { input: 3,  output: 15, cacheRead: 0.3, cacheCreate: 3.75 },
  'claude-haiku-4-5':  { input: 1,  output: 5,  cacheRead: 0.1, cacheCreate: 1.25 },
};

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function estimateCost(m: ModelUsage): number {
  const p = Object.entries(PRICING).find(([k]) => m.model.includes(k))?.[1];
  if (!p) return 0;
  return (m.input * p.input + m.output * p.output + m.cacheRead * p.cacheRead + m.cacheCreate * p.cacheCreate) / 1_000_000;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

interface State {
  data: UsageResult | null;
  scope: 'all' | 'project';
  loading: boolean;
}

export function mount(root: HTMLElement): void {
  const state: State = { data: null, scope: 'all', loading: false };

  async function load() {
    state.loading = true;
    render();
    try {
      state.data = await call<UsageResult>('usage:query', { scope: state.scope });
    } catch (err: any) {
      console.error('usage:query failed', err);
      state.data = { daily: [], models: [], projects: [], totalSessions: 0 };
    } finally {
      state.loading = false;
      render();
    }
  }

  function renderChart(daily: DailyUsage[]): string {
    if (daily.length === 0) return `<div class="text-sm opacity-60 py-8 text-center">${t('common.noData')}</div>`;
    const items = daily.slice().reverse(); // oldest → newest
    const max = Math.max(...items.map(d => d.input + d.output + d.cacheRead + d.cacheCreate), 1);
    const width = 800;
    const height = 260;
    const pad = { top: 10, right: 10, bottom: 28, left: 10 };
    const chartH = height - pad.top - pad.bottom;
    const band = (width - pad.left - pad.right) / items.length;
    const barW = band * 0.7;
    const scale = (n: number) => (n / max) * chartH;
    const segments: Array<{ key: keyof DailyUsage; color: string; labelKey: string }> = [
      { key: 'input', color: '#60a5fa', labelKey: 'chart.input' },
      { key: 'output', color: '#34d399', labelKey: 'chart.output' },
      { key: 'cacheRead', color: '#a78bfa', labelKey: 'chart.cacheRead' },
      { key: 'cacheCreate', color: '#f472b6', labelKey: 'chart.cacheCreate' },
    ];
    const bars = items.map((d, i) => {
      const x = pad.left + i * band + (band - barW) / 2;
      let yCursor = height - pad.bottom;
      const rects = segments.map(s => {
        const v = d[s.key] as number;
        const h = scale(v);
        yCursor -= h;
        return `<rect x="${x}" y="${yCursor}" width="${barW}" height="${h}" fill="${s.color}"><title>${t(s.labelKey)}: ${formatTokens(v)}</title></rect>`;
      }).join('');
      const labelX = x + barW / 2;
      return `<g>${rects}<text x="${labelX}" y="${height - 10}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">${escapeHtml(d.date.slice(5))}</text></g>`;
    }).join('');
    const legend = segments.map(s =>
      `<span class="inline-flex items-center gap-1 text-xs mr-3">
        <span class="inline-block w-2 h-2 rounded-sm" style="background:${s.color}"></span>${t(s.labelKey)}
      </span>`
    ).join('');
    return `
      <div class="space-y-2">
        <div>${legend}</div>
        <svg viewBox="0 0 ${width} ${height}" class="w-full h-64 block" preserveAspectRatio="none">${bars}</svg>
      </div>
    `;
  }

  function renderCards(totals: { input: number; output: number; cost: number }, totalSessions: number): string {
    const cards = [
      { label: t('dashboard.inputTokens'), value: formatTokens(totals.input) },
      { label: t('dashboard.outputTokens'), value: formatTokens(totals.output) },
      { label: t('dashboard.estimatedCost'), value: `$${totals.cost.toFixed(2)}` },
      { label: t('dashboard.totalSessions'), value: String(totalSessions) },
    ];
    return cards.map(c => `
      <div class="border border-current/15 rounded p-3 text-center">
        <div class="text-lg font-semibold">${escapeHtml(c.value)}</div>
        <div class="text-xs opacity-60 mt-1">${escapeHtml(c.label)}</div>
      </div>
    `).join('');
  }

  function renderModelTable(models: ModelUsage[]): string {
    if (models.length === 0) return `<div class="text-sm opacity-60">${t('common.noData')}</div>`;
    const rows = models.map(m => `
      <tr class="border-t border-current/10">
        <td class="py-1">${escapeHtml(m.model)}</td>
        <td class="text-center">${m.count}</td>
        <td class="text-center">${formatTokens(m.input)}</td>
        <td class="text-center">${formatTokens(m.output)}</td>
        <td class="text-right">$${estimateCost(m).toFixed(2)}</td>
      </tr>
    `).join('');
    return `
      <table class="w-full text-sm">
        <thead class="opacity-70">
          <tr>
            <th class="text-left py-1">${t('table.model')}</th>
            <th>${t('table.calls')}</th>
            <th>${t('table.input')}</th>
            <th>${t('table.output')}</th>
            <th>${t('table.estimatedCost')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function render() {
    const { data, scope, loading } = state;
    if (!data) {
      root.innerHTML = `<div class="p-6 text-sm opacity-70">${t('common.loading')}</div>`;
      return;
    }
    const totals = data.models.reduce(
      (acc, m) => ({ input: acc.input + m.input, output: acc.output + m.output, cost: acc.cost + estimateCost(m) }),
      { input: 0, output: 0, cost: 0 },
    );

    root.innerHTML = `
      <div class="p-6 space-y-6 max-w-5xl mx-auto">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-semibold">${t('dashboard.title')}</h1>
          <div class="flex gap-2 items-center">
            <select id="scope-select" class="bg-transparent border border-current/20 rounded px-2 py-1 text-sm">
              <option value="all" ${scope === 'all' ? 'selected' : ''}>${t('dashboard.scopeAll')}</option>
              <option value="project" ${scope === 'project' ? 'selected' : ''}>${t('dashboard.scopeProject')}</option>
            </select>
            <button id="refresh-btn" ${loading ? 'disabled' : ''}
              class="border border-current/20 rounded px-3 py-1 text-sm disabled:opacity-50">
              ${loading ? '...' : t('common.refresh')}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-4 gap-3">${renderCards(totals, data.totalSessions)}</div>

        <section>
          <h2 class="text-xs uppercase tracking-wider opacity-60 mb-2">${t('dashboard.dailyTrend')}</h2>
          ${renderChart(data.daily)}
        </section>

        <section>
          <h2 class="text-xs uppercase tracking-wider opacity-60 mb-2">${t('dashboard.byModel')}</h2>
          ${renderModelTable(data.models)}
        </section>
      </div>
    `;

    const select = root.querySelector<HTMLSelectElement>('#scope-select');
    const refresh = root.querySelector<HTMLButtonElement>('#refresh-btn');
    select?.addEventListener('change', () => {
      state.scope = select.value as 'all' | 'project';
      load();
    });
    refresh?.addEventListener('click', () => load());
  }

  load();
}
