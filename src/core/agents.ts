import * as fs from 'fs/promises';
import * as path from 'path';

export type AgentScope = 'user' | 'project';

export interface Agent {
  name: string;
  description: string;
  scope: AgentScope;
  path: string;
  model?: string;
  tools?: string[];
  color?: string;
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

function extractFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of (match[1] ?? '').split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function parseInlineList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const m = raw.match(/^\[(.*)\]$/);
  if (!m) return undefined;
  const inner = m[1]?.trim() ?? '';
  if (!inner) return [];
  return inner
    .split(',')
    .map(s => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

async function walkMarkdown(dir: string): Promise<string[]> {
  if (!await exists(dir)) return [];
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

async function scanScope(dir: string, scope: AgentScope): Promise<Agent[]> {
  const files = await walkMarkdown(dir);
  const seen = new Set<string>();
  const out: Agent[] = [];
  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const fm = extractFrontmatter(content);
    const filenameId = path.basename(file, '.md');
    const name = fm['name'] || filenameId;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({
      name,
      description: fm['description'] ?? '',
      scope,
      path: file,
      model: fm['model'] || undefined,
      tools: parseInlineList(fm['tools']),
      color: fm['color'] || undefined,
    });
  }
  return out;
}

export function userAgentsDir(home: string): string {
  return path.join(home, 'agents');
}
export function projectAgentsDir(projectPath: string): string {
  return path.join(projectPath, '.claude', 'agents');
}

export async function listAgents(
  home: string,
  projectPath: string | null,
): Promise<Agent[]> {
  const userAgents = await scanScope(userAgentsDir(home), 'user');
  const projectAgents = projectPath ? await scanScope(projectAgentsDir(projectPath), 'project') : [];
  return [...userAgents, ...projectAgents];
}

const AGENT_TEMPLATE = (name: string) => `---
name: ${name}
description: <one-line trigger description>
---

# ${name}

Describe what this agent does and when Claude should delegate to it.
`;

export async function createAgent(
  baseDir: string,
  scope: AgentScope,
  name: string,
): Promise<string> {
  const dir = scope === 'user'
    ? userAgentsDir(baseDir)
    : projectAgentsDir(baseDir);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.md`);
  await fs.writeFile(file, AGENT_TEMPLATE(name), 'utf-8');
  return file;
}

export async function deleteAgent(agentFilePath: string): Promise<void> {
  await fs.rm(agentFilePath, { force: true });
}
