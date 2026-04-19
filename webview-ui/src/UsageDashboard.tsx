import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { call } from './rpc';
import type { UsageResult } from './types';

function formatTokens(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}千`;
  return String(n);
}

const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheCreate: number }> = {
  'claude-opus-4-7':    { input: 15, output: 75, cacheRead: 1.5, cacheCreate: 18.75 },
  'claude-sonnet-4-6':  { input: 3,  output: 15, cacheRead: 0.3, cacheCreate: 3.75 },
  'claude-haiku-4-5':   { input: 1,  output: 5,  cacheRead: 0.1, cacheCreate: 1.25 },
};

function estimateCost(m: { model: string; input: number; output: number; cacheRead: number; cacheCreate: number }): number {
  const p = Object.entries(PRICING).find(([k]) => m.model.includes(k))?.[1];
  if (!p) return 0;
  return (m.input * p.input + m.output * p.output + m.cacheRead * p.cacheRead + m.cacheCreate * p.cacheCreate) / 1_000_000;
}

export function UsageDashboard() {
  const [data, setData] = useState<UsageResult | null>(null);
  const [scope, setScope] = useState<'all' | 'project'>('all');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try { setData(await call<UsageResult>('usage:query', { scope })); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [scope]);

  if (!data) return <div className="p-6 text-sm opacity-70">加载中...</div>;

  const totals = data.models.reduce((acc, m) => ({
    input: acc.input + m.input, output: acc.output + m.output, cost: acc.cost + estimateCost(m),
  }), { input: 0, output: 0, cost: 0 });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Claude Usage</h1>
        <div className="flex gap-2 items-center">
          <select value={scope} onChange={e => setScope(e.target.value as any)}
            className="bg-transparent border border-current/20 rounded px-2 py-1 text-sm">
            <option value="all">全部项目</option>
            <option value="project">仅当前项目</option>
          </select>
          <button onClick={load} disabled={loading}
            className="border border-current/20 rounded px-3 py-1 text-sm">
            {loading ? '...' : '刷新'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card label="输入 tokens" value={formatTokens(totals.input)} />
        <Card label="输出 tokens" value={formatTokens(totals.output)} />
        <Card label="估算成本" value={`$${totals.cost.toFixed(2)}`} />
        <Card label="会话总数" value={String(data.totalSessions)} />
      </div>

      <Section title="每日趋势">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...data.daily].reverse()}>
              <XAxis dataKey="date" stroke="currentColor" tick={{ fontSize: 11 }} />
              <YAxis stroke="currentColor" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--vscode-editor-background)', border: '1px solid currentColor', color: 'var(--vscode-foreground)' }} />
              <Legend />
              <Bar dataKey="input" stackId="t" fill="#60a5fa" />
              <Bar dataKey="output" stackId="t" fill="#34d399" />
              <Bar dataKey="cacheRead" stackId="t" fill="#a78bfa" />
              <Bar dataKey="cacheCreate" stackId="t" fill="#f472b6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="按模型聚合">
        <table className="w-full text-sm">
          <thead className="opacity-70">
            <tr><th className="text-left py-1">模型</th><th>调用</th><th>输入</th><th>输出</th><th>估算成本</th></tr>
          </thead>
          <tbody>
            {data.models.map(m => (
              <tr key={m.model} className="border-t border-current/10">
                <td className="py-1">{m.model}</td>
                <td className="text-center">{m.count}</td>
                <td className="text-center">{formatTokens(m.input)}</td>
                <td className="text-center">{formatTokens(m.output)}</td>
                <td className="text-right">${estimateCost(m).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-current/15 rounded p-3 text-center">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs opacity-60 mt-1">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider opacity-60 mb-2">{title}</h2>
      {children}
    </section>
  );
}
