import * as fs from 'fs/promises';
import * as path from 'path';
import { runClaude } from './claude-cli';

export interface McpServer {
  name: string;
  transport: 'stdio' | 'http' | 'sse' | 'unknown';
  command?: string;
  url?: string;
  scope?: 'user' | 'project';
  status?: 'connected' | 'needs-auth' | 'error' | 'unknown';
}

async function readJsonSafe<T>(p: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'));
  } catch (err: any) {
    if (err?.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function listUserMcp(): Promise<McpServer[]> {
  try { return parseMcpListOutput(await runClaude(['mcp', 'list'])); }
  catch { return []; }
}

export async function addUserMcp(name: string, transport: string, urlOrCommand: string): Promise<string> {
  return runClaude(['mcp', 'add', '--transport', transport, name, urlOrCommand]);
}

export async function removeUserMcp(name: string): Promise<string> {
  return runClaude(['mcp', 'remove', name]);
}

export async function listProjectMcp(projectPath: string): Promise<McpServer[]> {
  const settings = await readJsonSafe<any>(path.join(projectPath, '.claude', 'settings.json'), {});
  const servers = settings.mcpServers ?? {};
  return Object.entries<any>(servers).map(([name, config]) => ({
    name,
    transport: (config.type || config.transport || 'unknown') as McpServer['transport'],
    url: config.url,
    command: config.command,
    scope: 'project' as const,
  }));
}

export async function addProjectMcp(projectPath: string, name: string, transport: string, urlOrCommand: string): Promise<void> {
  const dir = path.join(projectPath, '.claude');
  await fs.mkdir(dir, { recursive: true });
  const settingsPath = path.join(dir, 'settings.json');
  const settings: any = await readJsonSafe(settingsPath, {});
  if (!settings.mcpServers) settings.mcpServers = {};
  settings.mcpServers[name] = transport === 'stdio'
    ? { type: 'stdio', command: urlOrCommand }
    : { type: transport, url: urlOrCommand };
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

export async function removeProjectMcp(projectPath: string, name: string): Promise<void> {
  const settingsPath = path.join(projectPath, '.claude', 'settings.json');
  const settings: any = await readJsonSafe(settingsPath, {});
  if (settings.mcpServers && settings.mcpServers[name]) {
    delete settings.mcpServers[name];
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }
}

export function parseMcpListOutput(output: string): McpServer[] {
  const servers: McpServer[] = [];
  for (const line of output.split('\n').map(l => l.trim()).filter(Boolean)) {
    const match = line.match(/^(.+?):\s+(.+?)\s+-\s+(.+)$/);
    if (!match) continue;
    const name = match[1]?.trim() ?? '';
    const detail = match[2]?.trim() ?? '';
    const statusText = match[3]?.trim() ?? '';
    let status: McpServer['status'] = 'unknown';
    if (statusText.includes('Connected')) status = 'connected';
    else if (statusText.includes('Needs')) status = 'needs-auth';
    else if (/[Ee]rror/.test(statusText)) status = 'error';
    const isHttp = detail.startsWith('http');
    servers.push({
      name, status, scope: 'user',
      transport: isHttp ? 'http' : 'stdio',
      command: isHttp ? undefined : detail,
      url: isHttp ? detail : undefined,
    });
  }
  return servers;
}
