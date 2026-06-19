import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { listHooks } from './hooks';

async function writeJson(file: string, body: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(body, null, 2), 'utf-8');
}

describe('hooks', () => {
  let tmpHome: string;
  let tmpProject: string;

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-hooks-'));
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-hooks-proj-'));
  });
  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('returns [] when no settings or plugins exist', async () => {
    const result = await listHooks(tmpHome, tmpProject);
    assert.deepEqual(result, []);
  });

  it('flattens user-level command hooks with source=user', async () => {
    await writeJson(path.join(tmpHome, 'settings.json'), {
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: '/usr/local/bin/audit.sh' }] },
        ],
      },
    });
    const result = await listHooks(tmpHome, tmpProject);
    assert.equal(result.length, 1);
    const r = result[0]!;
    assert.equal(r.event, 'PreToolUse');
    assert.equal(r.matcher, 'Bash');
    assert.equal(r.handler.type, 'command');
    assert.equal(r.handler.summary, '/usr/local/bin/audit.sh');
    assert.deepEqual(r.source, { kind: 'user' });
  });

  it('picks up project settings hooks with source=project', async () => {
    await writeJson(path.join(tmpProject, '.claude', 'settings.json'), {
      hooks: {
        PostToolUse: [
          { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'lint.sh' }] },
        ],
      },
    });
    const result = await listHooks(tmpHome, tmpProject);
    const proj = result.find(r => r.source.kind === 'project');
    assert.ok(proj);
    assert.equal(proj?.event, 'PostToolUse');
    assert.equal(proj?.matcher, 'Edit|Write');
  });

  it('picks up local settings hooks with source=local', async () => {
    await writeJson(path.join(tmpProject, '.claude', 'settings.local.json'), {
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'init.sh' }] }],
      },
    });
    const result = await listHooks(tmpHome, tmpProject);
    const local = result.find(r => r.source.kind === 'local');
    assert.ok(local);
    assert.equal(local?.event, 'SessionStart');
    assert.equal(local?.matcher, '*');
  });

  it('normalizes missing/empty/star matcher to "*"', async () => {
    await writeJson(path.join(tmpProject, '.claude', 'settings.json'), {
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: 'command', command: 'a.sh' }] },
          { matcher: '', hooks: [{ type: 'command', command: 'b.sh' }] },
          { matcher: '*', hooks: [{ type: 'command', command: 'c.sh' }] },
        ],
      },
    });
    const result = await listHooks(tmpHome, tmpProject);
    const ups = result.filter(r => r.event === 'UserPromptSubmit');
    assert.equal(ups.length, 3);
    assert.ok(ups.every(r => r.matcher === '*'));
  });

  it('picks up plugin hooks from <installPath>/hooks/hooks.json with source=plugin', async () => {
    const pluginRoot = path.join(tmpHome, 'plugins', 'cache', 'mp', 'lint', '1.0.0');
    await writeJson(path.join(pluginRoot, 'hooks', 'hooks.json'), {
      hooks: {
        PostToolUse: [
          { matcher: 'Write', hooks: [{ type: 'command', command: 'plugin-lint.sh' }] },
        ],
      },
    });
    await writeJson(path.join(tmpHome, 'plugins', 'installed_plugins.json'), {
      version: 2,
      plugins: {
        'lint@mp': [{ scope: 'user', installPath: pluginRoot, version: '1.0.0' }],
      },
    });
    const result = await listHooks(tmpHome, tmpProject);
    const plugin = result.find(r => r.source.kind === 'plugin');
    assert.ok(plugin);
    assert.equal(plugin?.event, 'PostToolUse');
    if (plugin?.source.kind === 'plugin') {
      assert.equal(plugin.source.pluginKey, 'lint@mp');
    }
  });

  it('falls back to <installPath>/hooks.json when hooks/hooks.json is missing', async () => {
    const pluginRoot = path.join(tmpHome, 'plugins', 'cache', 'mp', 'legacy', '1.0.0');
    await writeJson(path.join(pluginRoot, 'hooks.json'), {
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'bye.sh' }] }],
      },
    });
    // Augment the existing installed_plugins.json instead of overwriting it,
    // so the prior "lint@mp" entry from the previous test stays attached.
    const installedFile = path.join(tmpHome, 'plugins', 'installed_plugins.json');
    const installed = JSON.parse(await fs.readFile(installedFile, 'utf-8'));
    installed.plugins['legacy@mp'] = [{ scope: 'user', installPath: pluginRoot, version: '1.0.0' }];
    await writeJson(installedFile, installed);

    const result = await listHooks(tmpHome, tmpProject);
    const legacy = result.find(r => r.source.kind === 'plugin' && r.source.pluginKey === 'legacy@mp');
    assert.ok(legacy);
    assert.equal(legacy?.event, 'Stop');
  });

  it('summarizes non-command handler types', async () => {
    await writeJson(path.join(tmpHome, 'settings.json'), {
      hooks: {
        Notification: [
          {
            matcher: 'permission_prompt',
            hooks: [
              { type: 'http', url: 'https://example.com/notify' },
              { type: 'mcp_tool', server: 'memory', tool: 'create_entities' },
              { type: 'prompt', prompt: 'Was this safe?\nReply yes or no.' },
              { type: 'agent', agent: 'security-reviewer' },
            ],
          },
        ],
      },
    });
    const result = await listHooks(tmpHome, tmpProject);
    const noti = result.filter(r => r.event === 'Notification');
    assert.equal(noti.length, 4);
    const byType = Object.fromEntries(noti.map(r => [r.handler.type, r.handler.summary]));
    assert.equal(byType['http'], 'https://example.com/notify');
    assert.equal(byType['mcp_tool'], 'memory.create_entities');
    assert.equal(byType['prompt'], 'Was this safe?');
    assert.equal(byType['agent'], 'security-reviewer');
  });

  it('silently skips malformed entries (not an array, missing inner hooks)', async () => {
    await writeJson(path.join(tmpHome, 'settings.json'), {
      hooks: {
        PreToolUse: 'not-an-array',
        PostToolUse: [
          'not-an-object',
          { matcher: 'Bash' /* missing inner hooks array */ },
          { matcher: 'Bash', hooks: 'not-an-array' },
        ],
      },
    });
    const result = await listHooks(tmpHome, tmpProject);
    // We only care that the malformed USER file produces 0 entries.
    // Other sources (project/local/plugins) may still contribute from earlier tests.
    const userEntries = result.filter(r => r.source.kind === 'user');
    assert.deepEqual(userEntries, []);
  });
});
