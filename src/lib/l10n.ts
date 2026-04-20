import * as vscode from 'vscode';
import enBundle from '../../l10n/bundle.l10n.json';

const EN = enBundle as Record<string, string>;

function substitute(tpl: string, args: (string | number)[]): string {
  return tpl.replace(/\{(\d+)\}/g, (_, i) => {
    const v = args[Number(i)];
    return v === undefined ? '' : String(v);
  });
}

/**
 * Translate `key` using vscode.l10n (which reads bundle.l10n.<locale>.json),
 * falling back to the bundled English source when no translation is loaded.
 *
 * VSCode only auto-loads locale-specific bundles; there is no default bundle.
 * Without this wrapper, users on unsupported locales see raw keys like
 * "dashboard.title" instead of "Claude Usage".
 */
export function t(key: string, ...args: (string | number)[]): string {
  const translated = vscode.l10n.t(key, ...args);
  if (translated !== key) return translated;
  const en = EN[key];
  if (typeof en !== 'string') return key;
  return substitute(en, args);
}
