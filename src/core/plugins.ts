import * as fs from 'fs/promises';
import * as path from 'path';
import { runClaude } from './claude-cli';

export interface InstalledPlugin {
  name: string;
  version: string;
  scope: 'user' | 'project';
  enabled: boolean;
  marketplace: string;
  installPath?: string;
  installedAt?: string;
  skills: string[];
  agents: string[];
  hasMcp: boolean;
}

export interface AvailablePlugin {
  name: string;
  description: string;
  marketplace: string;
  category?: string;
  homepage?: string;
}

export interface Marketplace {
  name: string;
  source: any;
  installLocation?: string;
  lastUpdated?: string;
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readJsonSafe<T>(p: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'));
  } catch (err: any) {
    if (err?.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function listInstalledPlugins(home: string): Promise<InstalledPlugin[]> {
  const data = await readJsonSafe<any>(path.join(home, 'plugins', 'installed_plugins.json'), null);
  if (!data) return [];
  const settings = await readJsonSafe<any>(path.join(home, 'settings.json'), {});
  const enabledPlugins: Record<string, boolean> = settings?.enabledPlugins || {};

  const plugins: InstalledPlugin[] = [];
  for (const [key, entries] of Object.entries<any>(data.plugins || {})) {
    const entry = (entries as any[])[0];
    if (!entry) continue;
    const [name, marketplace] = key.split('@');
    let skills: string[] = [];
    let agents: string[] = [];
    let hasMcp = false;
    if (entry.installPath && await exists(entry.installPath)) {
      try {
        const items = await fs.readdir(path.join(entry.installPath, 'skills'), { withFileTypes: true });
        skills = items.filter(e => e.isDirectory()).map(e => e.name);
      } catch {}
      try {
        const items = await fs.readdir(path.join(entry.installPath, 'agents'));
        agents = items.filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
      } catch {}
      hasMcp = await exists(path.join(entry.installPath, '.mcp.json'));
    }
    plugins.push({
      name: name || key,
      version: entry.version || 'unknown',
      scope: entry.scope || 'user',
      enabled: enabledPlugins[key] !== false,
      installPath: entry.installPath,
      marketplace: marketplace || '',
      installedAt: entry.installedAt,
      skills, agents, hasMcp,
    });
  }
  return plugins;
}

export async function listMarketplaces(home: string): Promise<Marketplace[]> {
  const data = await readJsonSafe<any>(path.join(home, 'plugins', 'known_marketplaces.json'), null);
  if (!data) return [];
  return Object.entries<any>(data).map(([name, info]) => ({
    name, source: info.source, installLocation: info.installLocation, lastUpdated: info.lastUpdated,
  }));
}

export async function listAvailablePlugins(home: string): Promise<AvailablePlugin[]> {
  const marketplacesDir = path.join(home, 'plugins', 'marketplaces');
  if (!await exists(marketplacesDir)) return [];
  const out: AvailablePlugin[] = [];
  for (const mpName of await fs.readdir(marketplacesDir)) {
    const mpDir = path.join(marketplacesDir, mpName);
    const manifest = await readJsonSafe<any>(path.join(mpDir, '.claude-plugin', 'marketplace.json'), null);
    if (manifest?.plugins?.length) {
      for (const p of manifest.plugins) {
        out.push({
          name: p.name,
          description: p.description || '',
          marketplace: mpName,
          category: p.category,
          homepage: p.homepage,
        });
      }
      continue;
    }
    for (const subDir of ['plugins', 'external_plugins']) {
      const pluginsDir = path.join(mpDir, subDir);
      if (!await exists(pluginsDir)) continue;
      for (const pluginName of await fs.readdir(pluginsDir)) {
        let description = '';
        try {
          const readme = await fs.readFile(path.join(pluginsDir, pluginName, 'README.md'), 'utf-8');
          const lines = readme.split('\n').filter(l => l.trim());
          const descLine = lines.find((l, i) => i > 0 && !l.startsWith('#'));
          if (descLine) description = descLine.trim();
        } catch {}
        out.push({ name: pluginName, description, marketplace: mpName });
      }
    }
  }
  return out;
}

export async function installPlugin(name: string): Promise<string> {
  return runClaude(['plugin', 'install', name], 120000);
}
export async function uninstallPlugin(name: string): Promise<string> {
  return runClaude(['plugin', 'uninstall', name]);
}
export async function togglePlugin(name: string, enable: boolean): Promise<string> {
  return runClaude(['plugin', enable ? 'enable' : 'disable', name]);
}
export async function addMarketplace(source: string): Promise<string> {
  return runClaude(['plugin', 'marketplace', 'add', source], 120000);
}
export async function removeMarketplace(name: string): Promise<string> {
  return runClaude(['plugin', 'marketplace', 'remove', name]);
}
