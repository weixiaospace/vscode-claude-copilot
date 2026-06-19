import * as path from 'path';
import {
  defineFileResource,
  extractFrontmatter,
  parseInlineList,
  listResource,
  createResource,
  deleteResource,
  type FileResourceItem,
} from './file-resource';

/**
 * Agents' `tools:` field can be authored in three forms across the wild:
 *   tools: [Read, Edit]      ← inline-array form (our test fixtures use this)
 *   tools: Read, Edit, Bash  ← comma-scalar form (the official docs use this)
 *   tools: Bash              ← single tool
 * Block-list form (`- Read\n  - Edit`) is multi-line and falls outside the
 * single-line frontmatter parser; agents authored that way will simply not
 * surface a tools count in the tree, but the agent itself still works in CLI.
 */
function parseAgentTools(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const inline = parseInlineList(trimmed);
  if (inline !== undefined) return inline;
  return trimmed
    .split(',')
    .map(s => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

export type AgentScope = 'user' | 'project';

export interface Agent extends FileResourceItem {
  model?: string;
  tools?: string[];
  color?: string;
}

export function userAgentsDir(home: string): string {
  return path.join(home, 'agents');
}
export function projectAgentsDir(projectPath: string): string {
  return path.join(projectPath, '.claude', 'agents');
}

const AGENT_TEMPLATE = (name: string) => `---
name: ${name}
description: <one-line trigger description>
---

# ${name}

Describe what this agent does and when Claude should delegate to it.
`;

export const agentsDescriptor = defineFileResource<Agent>({
  kind: 'agent',
  scopeRoots: {
    user: userAgentsDir,
    project: projectAgentsDir,
  },
  discovery: 'recursive',
  parse: (filePath, content, scope) => {
    const fm = extractFrontmatter(content);
    const filenameId = path.basename(filePath, '.md');
    return {
      name: fm['name'] || filenameId,
      description: fm['description'] ?? '',
      scope,
      path: filePath,
      model: fm['model'] || undefined,
      tools: parseAgentTools(fm['tools']),
      color: fm['color'] || undefined,
    };
  },
  template: AGENT_TEMPLATE,
  createFilePath: (baseDir, scope, name) =>
    scope === 'user'
      ? path.join(userAgentsDir(baseDir), `${name}.md`)
      : path.join(projectAgentsDir(baseDir), `${name}.md`),
  deletePath: filePath => filePath,
});

export const listAgents = (home: string, projectPath: string | null) =>
  listResource(agentsDescriptor, home, projectPath);
export const createAgent = (baseDir: string, scope: AgentScope, name: string) =>
  createResource(agentsDescriptor, baseDir, scope, name);
export const deleteAgent = (agentFilePath: string) =>
  deleteResource(agentsDescriptor, agentFilePath);
