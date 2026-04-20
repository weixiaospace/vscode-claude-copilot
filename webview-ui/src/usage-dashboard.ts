import { call } from './rpc';
import type { UsageResult, DailyUsage, ModelUsage } from './types';

const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheCreate: number }> = {
  'claude-opus-4-7':   { input: 15, output: 75, cacheRead: 1.5, cacheCreate: 18.75 },
  'claude-sonnet-4-6': { input: 3,  output: 15, cacheRead: 0.3, cacheCreate: 3.75 },
  'claude-haiku-4-5':  { input: 1,  output: 5,  cacheRead: 0.1, cacheCreate: 1.25 },
};

function formatTokens(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}千`;
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
    if (daily.length === 0) return `<div class="text-sm opacity-60 py-8 text-center">暂无数据</div>`;
    const items = daily.slice().reverse(); // oldest → newest
    const max = Math.max(...items.map(d => d.input + d.output + d.cacheRead + d.cacheCreate), 1);
    const width = 800;
    const height = 260;
    const pad = { top: 10, right: 10, bottom: 28, left: 10 };
    const chartH = height - pad.top - pad.bottom;
    const band = (width - pad.left - pad.right) / items.length;
    const barW = band * 0.7;
    const scale = (n: number) => (n / max) * chartH;
    const segments: Array<{ key: keyof DailyUsage; color: string; label: string }> = [
      { key: 'input', color: '#60a5fa', label: '输入' },
      { key: 'output', color: '#34d399', label: '输出' },
      { key: 'cacheRead', color: '#a78bfa', label: '缓存读' },
      { key: 'cacheCreate', color: '#f472b6', label: '缓存创' },
    ];
    const bars = items.map((d, i) => {
      const x = pad.left + i * band + (band - barW) / 2;
      let yCursor = height - pad.bottom;
      const rects = segments.map(s => {
        const v = d[s.key] as number;
        const h = scale(v);
        yCursor -= h;
        return `<rect x="${x}" y="${yCursor}" width="${barW}" height="${h}" fill="${s.color}"><title>${s.label}: ${formatTokens(v)}</title></rect>`;
      }).join('');
      const labelX = x + barW / 2;
      return `<g>${rects}<text x="${labelX}" y="${height - 10}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">${escapeHtml(d.date.slice(5))}</text></g>`;
    }).join('');
    const legend = segments.map(s =>
      `<span class="inline-flex items-center gap-1 text-xs mr-3">
        <span class="inline-block w-2 h-2 rounded-sm" style="background:${s.color}"></span>${s.label}
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
      { label: '输入 tokens', value: formatTokens(totals.input) },
      { label: '输出 tokens', value: formatTokens(totals.output) },
      { label: '估算成本', value: `$${totals.cost.toFixed(2)}` },
      { label: '会话总数', value: String(totalSessions) },
    ];
    return cards.map(c => `
      <div class="border border-current/15 rounded p-3 text-center">
        <div class="text-lg font-semibold">${escapeHtml(c.value)}</div>
        <div class="text-xs opacity-60 mt-1">${escapeHtml(c.label)}</div>
      </div>
    `).join('');
  }

  function renderModelTable(models: ModelUsage[]): string {
    if (models.length === 0) return `<div class="text-sm opacity-60">暂无数据</div>`;
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
          <tr><th class="text-left py-1">模型</th><th>调用</th><th>输入</th><th>输出</th><th>估算成本</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function render() {
    const { data, scope, loading } = state;
    if (!data) {
      root.innerHTML = `<div class="p-6 text-sm opacity-70">加载中...</div>`;
      return;
    }
    const totals = data.models.reduce(
      (acc, m) => ({ input: acc.input + m.input, output: acc.output + m.output, cost: acc.cost + estimateCost(m) }),
      { input: 0, output: 0, cost: 0 },
    );

    root.innerHTML = `
      <div class="p-6 space-y-6 max-w-5xl mx-auto">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-semibold">Claude Usage</h1>
          <div class="flex gap-2 items-center">
            <select id="scope-select" class="bg-transparent border border-current/20 rounded px-2 py-1 text-sm">
              <option value="all" ${scope === 'all' ? 'selected' : ''}>全部项目</option>
              <option value="project" ${scope === 'project' ? 'selected' : ''}>仅当前项目</option>
            </select>
            <button id="refresh-btn" ${loading ? 'disabled' : ''}
              class="border border-current/20 rounded px-3 py-1 text-sm disabled:opacity-50">
              ${loading ? '...' : '刷新'}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-4 gap-3">${renderCards(totals, data.totalSessions)}</div>

        <section>
          <h2 class="text-xs uppercase tracking-wider opacity-60 mb-2">每日趋势</h2>
          ${renderChart(data.daily)}
        </section>

        <section>
          <h2 class="text-xs uppercase tracking-wider opacity-60 mb-2">按模型聚合</h2>
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
