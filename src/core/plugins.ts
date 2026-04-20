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
  types: PluginType[];
}

export type PluginType = 'skills' | 'agents' | 'hooks' | 'mcp' | 'commands';

export interface AvailablePlugin {
  name: string;
  description: string;
  marketplace: string;
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
    const types: PluginType[] = [];
    if (entry.installPath) {
      const [hasSkills, hasAgents, hasHooks, hasMcp, hasCommands] = await Promise.all([
        exists(path.join(entry.installPath, 'skills')),
        exists(path.join(entry.installPath, 'agents')),
        exists(path.join(entry.installPath, 'hooks'))
          .then(ok => ok || exists(path.join(entry.installPath, 'hooks.json'))),
        exists(path.join(entry.installPath, '.mcp.json')),
        exists(path.join(entry.installPath, 'commands')),
      ]);
      if (hasSkills) types.push('skills');
      if (hasAgents) types.push('agents');
      if (hasHooks) types.push('hooks');
      if (hasMcp) types.push('mcp');
      if (hasCommands) types.push('commands');
    }
    plugins.push({
      name: name || key,
      version: entry.version || 'unknown',
      scope: entry.scope || 'user',
      enabled: enabledPlugins[key] !== false,
      marketplace: marketplace || '',
      installPath: entry.installPath,
      types,
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
export async function updateMarketplace(name?: string): Promise<string> {
  const args = ['plugin', 'marketplace', 'update'];
  if (name) args.push(name);
  return runClaude(args, 120000);
}
