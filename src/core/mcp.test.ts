import { strict as assert } from 'assert';
import { describe, it, before, after } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { listProjectMcp, addProjectMcp, removeProjectMcp, parseMcpListOutput } from './mcp';

describe('mcp', () => {
  let tmpProject: string;

  before(async () => {
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-mcp-'));
  });
  after(async () => {
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  it('listProjectMcp returns [] when settings.json missing', async () => {
    const result = await listProjectMcp(tmpProject);
    assert.deepEqual(result, []);
  });

  it('addProjectMcp persists stdio server', async () => {
    await addProjectMcp(tmpProject, 'foo', 'stdio', 'node /tmp/server.js');
    const result = await listProjectMcp(tmpProject);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, 'foo');
    assert.equal(result[0]?.transport, 'stdio');
    assert.equal(result[0]?.command, 'node /tmp/server.js');
  });

  it('addProjectMcp persists http server', async () => {
    await addProjectMcp(tmpProject, 'bar', 'http', 'https://example.com/mcp');
    const result = await listProjectMcp(tmpProject);
    const bar = result.find(s => s.name === 'bar');
    assert.equal(bar?.transport, 'http');
    assert.equal(bar?.url, 'https://example.com/mcp');
  });

  it('removeProjectMcp deletes the entry', async () => {
    await removeProjectMcp(tmpProject, 'foo');
    const result = await listProjectMcp(tmpProject);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, 'bar');
  });

  it('parseMcpListOutput parses CLI output', () => {
    const sample = `context7: stdio - Connected
  playwright: https://example.com - Connected
  broken: stdio - Error`;
    const result = parseMcpListOutput(sample);
    assert.equal(result.length, 3);
    assert.equal(result[0]?.name, 'context7');
    assert.equal(result[0]?.status, 'connected');
    assert.equal(result[1]?.transport, 'http');
    assert.equal(result[2]?.status, 'error');
  });
});
