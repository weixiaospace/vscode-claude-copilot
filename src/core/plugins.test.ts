import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { listInstalledPlugins, listMarketplaces, listAvailablePlugins } from './plugins';

describe('plugins', () => {
  let tmpHome: string;

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-plugins-'));
    await fs.mkdir(path.join(tmpHome, 'plugins'), { recursive: true });
  });
  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it('listInstalledPlugins returns [] when installed_plugins.json missing', async () => {
    const result = await listInstalledPlugins(tmpHome);
    assert.deepEqual(result, []);
  });

  it('listInstalledPlugins reads installed plugins and merges enabled state', async () => {
    await fs.writeFile(path.join(tmpHome, 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        plugins: {
          'foo@official': [{ version: '1.0.0', scope: 'user', installPath: '/tmp/foo', installedAt: '2026-04-20' }],
          'bar@private': [{ version: '0.1.0', scope: 'user', installPath: '/tmp/bar', installedAt: '2026-04-20' }],
        },
      }));
    await fs.writeFile(path.join(tmpHome, 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'foo@official': true, 'bar@private': false } }));
    const result = await listInstalledPlugins(tmpHome);
    assert.equal(result.length, 2);
    const foo = result.find(p => p.name === 'foo');
    const bar = result.find(p => p.name === 'bar');
    assert.equal(foo?.enabled, true);
    assert.equal(bar?.enabled, false);
    assert.equal(foo?.marketplace, 'official');
  });

  it('listMarketplaces returns [] when known_marketplaces.json missing', async () => {
    const result = await listMarketplaces(tmpHome);
    assert.deepEqual(result, []);
  });

  it('listMarketplaces parses known_marketplaces.json', async () => {
    await fs.writeFile(path.join(tmpHome, 'plugins', 'known_marketplaces.json'),
      JSON.stringify({
        official: { source: { source: 'github', repo: 'anthropics/claude-plugins-official' }, installLocation: '/tmp/x' },
      }));
    const result = await listMarketplaces(tmpHome);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, 'official');
  });

  it('listAvailablePlugins reads manifest and falls back to dir scan', async () => {
    const mpDir = path.join(tmpHome, 'plugins', 'marketplaces', 'official');
    await fs.mkdir(path.join(mpDir, '.claude-plugin'), { recursive: true });
    await fs.writeFile(path.join(mpDir, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({ plugins: [{ name: 'cool-plugin', description: 'cool' }] }));
    const result = await listAvailablePlugins(tmpHome);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, 'cool-plugin');
    assert.equal(result[0]?.marketplace, 'official');
  });
});
