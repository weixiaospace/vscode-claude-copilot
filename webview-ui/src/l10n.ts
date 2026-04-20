declare global {
  interface Window { __l10n?: Record<string, string>; }
}

export function t(key: string, ...args: (string | number)[]): string {
  const tpl = window.__l10n?.[key] ?? key;
  if (args.length === 0) return tpl;
  return tpl.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ''));
}
