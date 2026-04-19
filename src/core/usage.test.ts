import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { queryUsage } from './usage';

describe('usage', () => {
  let tmpHome: string;

  before(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-usage-'));
    const projDir = path.join(tmpHome, 'projects', '-tmp-proj-a');
    await fs.mkdir(projDir, { recursive: true });
    const lines = [
      JSON.stringify({ type: 'assistant', timestamp: '2026-04-20T10:00:00Z', message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 100, output_tokens: 50 } } }),
      JSON.stringify({ type: 'assistant', timestamp: '2026-04-20T11:00:00Z', message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 1000 } } }),
      JSON.stringify({ type: 'user', message: { content: 'hi' } }),
      JSON.stringify({ type: 'assistant', timestamp: '2026-04-19T10:00:00Z', message: { model: 'claude-opus-4-7', usage: { input_tokens: 500, output_tokens: 300 } } }),
    ];
    await fs.writeFile(path.join(projDir, 'session1.jsonl'), lines.join('\n'));
  });
  after(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it('queryUsage aggregates across all projects when no filter', async () => {
    const r = await queryUsage(tmpHome, null);
    assert.equal(r.totalSessions, 1);
    assert.equal(r.daily.length, 2);
    assert.equal(r.models.length, 2);
    const sonnet = r.models.find(m => m.model.includes('sonnet'));
    assert.equal(sonnet?.input, 300);
    assert.equal(sonnet?.output, 130);
    assert.equal(sonnet?.cacheRead, 1000);
  });

  it('queryUsage returns empty when projects dir missing', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-usage-empty-'));
    const r = await queryUsage(empty, null);
    assert.deepEqual(r, { daily: [], models: [], projects: [], totalSessions: 0 });
    await fs.rm(empty, { recursive: true, force: true });
  });
});
