import { call } from './rpc';
import { t } from './l10n';
import type { UsageResult, DailyUsage, ModelUsage, ProjectUsage } from './types';

declare global {
  interface Window { Chart?: any; }
}

// Official Anthropic pricing (USD per million tokens)
// https://www.anthropic.com/pricing
const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheCreate: number }> = {
  'claude-opus-4-7':   { input: 15, output: 75, cacheRead: 1.5,  cacheCreate: 18.75 },
  'claude-opus-4':     { input: 15, output: 75, cacheRead: 1.5,  cacheCreate: 18.75 },
  'claude-sonnet-4-6': { input: 3,  output: 15, cacheRead: 0.3,  cacheCreate: 3.75 },
  'claude-sonnet-4':   { input: 3,  output: 15, cacheRead: 0.3,  cacheCreate: 3.75 },
  'claude-haiku-4-5':  { input: 1,  output: 5,  cacheRead: 0.1,  cacheCreate: 1.25 },
  'claude-haiku-4':    { input: 1,  output: 5,  cacheRead: 0.1,  cacheCreate: 1.25 },
  'claude-3-5-sonnet': { input: 3,  output: 15, cacheRead: 0.3,  cacheCreate: 3.75 },
  'claude-3-5-haiku':  { input: 0.8, output: 4, cacheRead: 0.08, cacheCreate: 1.0 },
  'claude-3-opus':     { input: 15, output: 75, cacheRead: 1.5,  cacheCreate: 18.75 },
};

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface CostItem { input: number; output: number; cacheRead: number; cacheCreate: number }

function estimateCostFor(model: string, c: CostItem): number {
  const entry = Object.entries(PRICING).find(([k]) => model.includes(k))?.[1];
  if (!entry) return 0;
  return (c.input * entry.input + c.output * entry.output + c.cacheRead * entry.cacheRead + c.cacheCreate * entry.cacheCreate) / 1_000_000;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}

function projectDisplayName(name: string): string {
  const parts = name.replace(/^-/, '').split('-');
  if (parts.length <= 2) return parts.join('/');
  return parts.slice(-2).join('/');
}

type Granularity = 'day' | 'week' | 'month';

function isoWeekKey(dateStr: string): string {
  // ISO week: yyyy-Www
  const d = new Date(dateStr + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return dateStr;
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

interface Bucket extends DailyUsage {
  startDate: string;
  endDate: string;
}

function aggregate(daily: DailyUsage[], gran: Granularity): Bucket[] {
  if (gran === 'day') return daily.map(d => ({ ...d, startDate: d.date, endDate: d.date }));
  const keyFn = gran === 'week' ? isoWeekKey : monthKey;
  const map: Record<string, Bucket> = {};
  for (const d of daily) {
    const k = keyFn(d.date);
    if (!map[k]) map[k] = { date: k, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, sessions: 0, startDate: d.date, endDate: d.date };
    const b = map[k];
    b.input += d.input;
    b.output += d.output;
    b.cacheRead += d.cacheRead;
    b.cacheCreate += d.cacheCreate;
    b.sessions += d.sessions;
    if (d.date < b.startDate) b.startDate = d.date;
    if (d.date > b.endDate) b.endDate = d.date;
  }
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

function weekRange(key: string): { start: string; end: string } | null {
  // yyyy-Www → compute Monday + Sunday
  const m = key.match(/^(\d{4})-W(\d+)$/);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  // ISO: week 1 contains Jan 4. Monday of week N = Monday of week 1 + (N-1)*7 days.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return { start: fmt(monday), end: fmt(sunday) };
}

interface State {
  data: UsageResult | null;
  scope: 'all' | 'project';
  granularity: Granularity;
  loading: boolean;
}

export function mount(root: HTMLElement): void {
  const state: State = { data: null, scope: 'all', granularity: 'day', loading: false };
  let trendChart: any = null;
  let modelChart: any = null;

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

  function renderCards(totals: { input: number; output: number; cacheRead: number; cacheCreate: number; cost: number; sessions: number }): string {
    const highlight = 'rounded-lg border border-current/25 p-4 text-center bg-current/[0.04]';
    const muted = 'rounded-lg border border-current/15 p-4 text-center bg-current/[0.02]';
    const cards = [
      { label: t('dashboard.inputTokens'), value: formatTokens(totals.input), cls: muted },
      { label: t('dashboard.outputTokens'), value: formatTokens(totals.output), cls: muted },
      { label: t('chart.cacheRead'), value: formatTokens(totals.cacheRead), cls: muted },
      { label: t('chart.cacheCreate'), value: formatTokens(totals.cacheCreate), cls: muted },
      { label: t('dashboard.totalSessions'), value: String(totals.sessions), cls: muted },
      { label: t('dashboard.estimatedCost'), value: `$${totals.cost.toFixed(2)}`, cls: highlight },
    ];
    return cards.map(c => `
      <div class="${c.cls}">
        <div class="text-xl font-semibold">${escapeHtml(c.value)}</div>
        <div class="text-xs opacity-60 mt-1">${escapeHtml(c.label)}</div>
      </div>
    `).join('');
  }

  function renderModelTable(models: ModelUsage[]): string {
    if (models.length === 0) return `<div class="text-sm opacity-60 py-4 text-center">${t('common.noData')}</div>`;
    const rows = models.map(m => `
      <tr class="border-t border-current/10">
        <td class="py-2 font-mono text-xs truncate">${escapeHtml(m.model)}</td>
        <td class="text-center py-2">${m.count}</td>
        <td class="text-center py-2">${formatTokens(m.input)}</td>
        <td class="text-center py-2">${formatTokens(m.output)}</td>
        <td class="text-right py-2 font-medium">$${estimateCostFor(m.model, m).toFixed(2)}</td>
      </tr>
    `).join('');
    return `
      <table class="w-full text-sm">
        <thead class="opacity-70 text-xs uppercase tracking-wider">
          <tr>
            <th class="text-left py-2">${t('table.model')}</th>
            <th class="py-2">${t('table.calls')}</th>
            <th class="py-2">${t('table.input')}</th>
            <th class="py-2">${t('table.output')}</th>
            <th class="text-right py-2">${t('table.estimatedCost')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderProjectTable(projects: ProjectUsage[], modelLookup: ModelUsage[]): string {
    if (projects.length === 0) return `<div class="text-sm opacity-60 py-4 text-center">${t('common.noData')}</div>`;
    // Approximate project cost using the ratio of its tokens to total, weighted by avg model rate
    const totalOutput = modelLookup.reduce((s, m) => s + m.output, 0) || 1;
    const totalCost = modelLookup.reduce((s, m) => s + estimateCostFor(m.model, m), 0);
    const rows = projects.map(p => {
      const costShare = totalCost * (p.output / totalOutput);
      return `
        <tr class="border-t border-current/10">
          <td class="py-2 text-xs truncate max-w-xs" title="${escapeHtml(p.name)}">${escapeHtml(projectDisplayName(p.name))}</td>
          <td class="text-center py-2">${p.sessions}</td>
          <td class="text-center py-2">${p.calls}</td>
          <td class="text-center py-2">${formatTokens(p.input)}</td>
          <td class="text-center py-2">${formatTokens(p.output)}</td>
          <td class="text-right py-2 font-medium">~$${costShare.toFixed(2)}</td>
        </tr>
      `;
    }).join('');
    return `
      <table class="w-full text-sm">
        <thead class="opacity-70 text-xs uppercase tracking-wider">
          <tr>
            <th class="text-left py-2">${t('table.project')}</th>
            <th class="py-2">${t('table.sessions')}</th>
            <th class="py-2">${t('table.calls')}</th>
            <th class="py-2">${t('table.input')}</th>
            <th class="py-2">${t('table.output')}</th>
            <th class="text-right py-2">${t('table.estimatedCost')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function formatBucketLabel(key: string, gran: Granularity): string {
    if (gran === 'day') return key.slice(5); // MM-DD
    if (gran === 'week') {
      const r = weekRange(key);
      return r ? `${r.start}–${r.end}` : key;
    }
    return key.slice(5); // month: MM
  }

  function blendedRates(models: ModelUsage[]): { input: number; output: number; cacheRead: number; cacheCreate: number } {
    // weighted avg price per MTok across all models, per category
    const totals = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
    const weighted = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
    for (const m of models) {
      const p = Object.entries(PRICING).find(([k]) => m.model.includes(k))?.[1];
      if (!p) continue;
      totals.input += m.input; weighted.input += m.input * p.input;
      totals.output += m.output; weighted.output += m.output * p.output;
      totals.cacheRead += m.cacheRead; weighted.cacheRead += m.cacheRead * p.cacheRead;
      totals.cacheCreate += m.cacheCreate; weighted.cacheCreate += m.cacheCreate * p.cacheCreate;
    }
    const rate = (w: number, t: number) => (t > 0 ? w / t : 0);
    return {
      input: rate(weighted.input, totals.input),
      output: rate(weighted.output, totals.output),
      cacheRead: rate(weighted.cacheRead, totals.cacheRead),
      cacheCreate: rate(weighted.cacheCreate, totals.cacheCreate),
    };
  }

  function bucketCost(b: Bucket, rates: ReturnType<typeof blendedRates>): number {
    return (b.input * rates.input + b.output * rates.output + b.cacheRead * rates.cacheRead + b.cacheCreate * rates.cacheCreate) / 1_000_000;
  }

  function drawCharts(daily: Bucket[], models: ModelUsage[], gran: Granularity) {
    if (!window.Chart) return;
    const fg = cssVar('--vscode-foreground', '#cccccc');
    const grid = fg + '22';
    window.Chart.defaults.color = fg;
    window.Chart.defaults.borderColor = grid;
    window.Chart.defaults.font.family = cssVar('--vscode-font-family', 'system-ui');

    const trendCanvas = root.querySelector<HTMLCanvasElement>('#trend-chart');
    if (trendCanvas) {
      const items = daily.slice().reverse();
      const labels = items.map(d => formatBucketLabel(d.date, gran));
      const rates = blendedRates(models);
      const build = (key: keyof DailyUsage, color: string, label: string) => ({
        type: 'bar' as const,
        label, data: items.map(d => d[key] as number),
        backgroundColor: color, borderColor: color, stack: 'tokens',
        yAxisID: 'y',
      });
      const costData = items.map(d => Number(bucketCost(d, rates).toFixed(2)));
      if (trendChart) trendChart.destroy();
      trendChart = new window.Chart(trendCanvas, {
        data: {
          labels,
          datasets: [
            build('input', '#60a5fa', t('chart.input')),
            build('output', '#34d399', t('chart.output')),
            build('cacheRead', '#a78bfa', t('chart.cacheRead')),
            build('cacheCreate', '#f472b6', t('chart.cacheCreate')),
            {
              type: 'line' as const,
              label: t('dashboard.estimatedCost'),
              data: costData,
              borderColor: '#f59e0b',
              backgroundColor: '#f59e0b',
              pointRadius: 3,
              pointHoverRadius: 5,
              tension: 0.2,
              borderWidth: 2,
              yAxisID: 'yCost',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, padding: 12, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx: any) => {
                  if (ctx.dataset.type === 'line') return `${ctx.dataset.label}: $${Number(ctx.parsed.y).toFixed(2)}`;
                  return `${ctx.dataset.label}: ${formatTokens(ctx.parsed.y)}`;
                },
              },
            },
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
            y: { stacked: true, grid: { color: grid }, ticks: { callback: (v: any) => formatTokens(v), font: { size: 10 } }, position: 'left' },
            yCost: { grid: { display: false }, ticks: { callback: (v: any) => `$${v}`, font: { size: 10 }, color: '#f59e0b' }, position: 'right' },
          },
        },
      });
    }

    const modelCanvas = root.querySelector<HTMLCanvasElement>('#model-chart');
    if (modelCanvas) {
      if (modelChart) modelChart.destroy();
      const labels = models.map(m => m.model.split('-').slice(0, 3).join('-'));
      const palette = ['#60a5fa', '#34d399', '#f59e0b', '#f472b6', '#a78bfa', '#22d3ee'];
      modelChart = new window.Chart(modelCanvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: models.map(m => m.output),
            backgroundColor: labels.map((_, i) => palette[i % palette.length]),
            borderColor: cssVar('--vscode-editor-background', '#1e1e1e'),
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '60%',
          plugins: {
            legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, padding: 8, font: { size: 11 } } },
            tooltip: { callbacks: { label: (ctx: any) => `${ctx.label}: ${formatTokens(ctx.parsed)}` } },
          },
        },
      });
    }
  }

  function granButton(key: Granularity, label: string): string {
    const active = state.granularity === key;
    return `<button data-gran="${key}" class="px-3 py-1 text-sm border border-current/20 ${active ? 'bg-current/10 font-medium' : 'hover:bg-current/5 opacity-70'}">${escapeHtml(label)}</button>`;
  }

  function render() {
    const { data, scope, granularity, loading } = state;
    if (!data) {
      root.innerHTML = `<div class="p-6 text-sm opacity-70">${t('common.loading')}</div>`;
      return;
    }
    const totals = data.models.reduce(
      (acc, m) => ({
        input: acc.input + m.input,
        output: acc.output + m.output,
        cacheRead: acc.cacheRead + m.cacheRead,
        cacheCreate: acc.cacheCreate + m.cacheCreate,
        cost: acc.cost + estimateCostFor(m.model, m),
        sessions: acc.sessions,
      }),
      { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, cost: 0, sessions: data.totalSessions },
    );
    const grouped = aggregate(data.daily, granularity);

    root.innerHTML = `
      <div class="p-6 space-y-6 max-w-5xl mx-auto">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h1 class="text-2xl font-semibold flex items-center gap-2">📊 ${t('dashboard.title')}</h1>
          <div class="flex gap-2 items-center">
            <select id="scope-select" class="bg-transparent border border-current/20 rounded px-2 py-1 text-sm">
              <option value="all" ${scope === 'all' ? 'selected' : ''}>${t('dashboard.scopeAll')}</option>
              <option value="project" ${scope === 'project' ? 'selected' : ''}>${t('dashboard.scopeProject')}</option>
            </select>
            <button id="refresh-btn" ${loading ? 'disabled' : ''}
              class="border border-current/20 rounded px-3 py-1 text-sm disabled:opacity-50 hover:bg-current/5">
              ${loading ? '...' : t('common.refresh')}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">${renderCards(totals)}</div>

        <section class="rounded-lg border border-current/15 p-4">
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 class="text-xs uppercase tracking-wider opacity-60 font-medium">${t('dashboard.trend')}</h2>
            <div class="inline-flex rounded overflow-hidden" role="tablist">
              ${granButton('day', t('dashboard.byDay'))}
              ${granButton('week', t('dashboard.byWeek'))}
              ${granButton('month', t('dashboard.byMonth'))}
            </div>
          </div>
          ${grouped.length === 0
            ? `<div class="text-sm opacity-60 py-8 text-center">${t('common.noData')}</div>`
            : `<div class="relative h-64"><canvas id="trend-chart"></canvas></div>`}
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section class="rounded-lg border border-current/15 p-4">
            <h2 class="text-xs uppercase tracking-wider opacity-60 mb-3 font-medium">${t('dashboard.byModel')}</h2>
            ${data.models.length === 0
              ? `<div class="text-sm opacity-60 py-8 text-center">${t('common.noData')}</div>`
              : `<div class="relative h-56"><canvas id="model-chart"></canvas></div>`}
          </section>

          <section class="rounded-lg border border-current/15 p-4 overflow-x-auto">
            <h2 class="text-xs uppercase tracking-wider opacity-60 mb-3 font-medium">${t('dashboard.byModel')}</h2>
            ${renderModelTable(data.models)}
          </section>
        </div>

        <section class="rounded-lg border border-current/15 p-4 overflow-x-auto">
          <h2 class="text-xs uppercase tracking-wider opacity-60 mb-3 font-medium">${t('dashboard.byProject')}</h2>
          ${renderProjectTable(data.projects, data.models)}
        </section>
      </div>
    `;

    drawCharts(grouped, data.models, granularity);

    root.querySelector<HTMLSelectElement>('#scope-select')?.addEventListener('change', (e) => {
      state.scope = (e.target as HTMLSelectElement).value as 'all' | 'project';
      load();
    });
    root.querySelector<HTMLButtonElement>('#refresh-btn')?.addEventListener('click', () => load());
    root.querySelectorAll<HTMLButtonElement>('button[data-gran]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.granularity = btn.dataset.gran as Granularity;
        render();
      });
    });
  }

  load();
}
