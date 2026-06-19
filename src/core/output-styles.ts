import * as fs from 'fs/promises';
import * as path from 'path';
import {
  defineFileResource,
  extractFrontmatter,
  listResource,
  createResource,
  deleteResource,
  type FileResourceItem,
} from './file-resource';

export type OutputStyleScope = 'user' | 'project';

export interface OutputStyle extends FileResourceItem {
  keepCoding: boolean;
}

export function userOutputStylesDir(home: string): string {
  return path.join(home, 'output-styles');
}
export function projectOutputStylesDir(projectPath: string): string {
  return path.join(projectPath, '.claude', 'output-styles');
}

const OUTPUT_STYLE_TEMPLATE = (name: string) => `---
name: ${name}
description: <one-line description shown in /config picker>
keep-coding-instructions: true
---

# ${name}

Instructions added to Claude Code's system prompt when this style is active.
`;

export const outputStylesDescriptor = defineFileResource<OutputStyle>({
  kind: 'outputStyle',
  scopeRoots: {
    user: userOutputStylesDir,
    project: projectOutputStylesDir,
  },
  discovery: 'recursive',
  parse: (filePath, content, scope) => {
    const fm = extractFrontmatter(content);
    return {
      name: fm['name'] || path.basename(filePath, '.md'),
      description: fm['description'] ?? '',
      scope,
      path: filePath,
      keepCoding: fm['keep-coding-instructions'] === 'true',
    };
  },
  template: OUTPUT_STYLE_TEMPLATE,
  createFilePath: (baseDir, scope, name) =>
    scope === 'user'
      ? path.join(userOutputStylesDir(baseDir), `${name}.md`)
      : path.join(projectOutputStylesDir(baseDir), `${name}.md`),
  deletePath: filePath => filePath,
});

export const listOutputStyles = (home: string, projectPath: string | null) =>
  listResource(outputStylesDescriptor, home, projectPath);
export const createOutputStyle = (baseDir: string, scope: OutputStyleScope, name: string) =>
  createResource(outputStylesDescriptor, baseDir, scope, name);
export const deleteOutputStyle = (filePath: string) =>
  deleteResource(outputStylesDescriptor, filePath);

// Active selection lives in .claude/settings.local.json (matching how
// Claude Code's `/config` UI persists it). We read/write only the
// `outputStyle` key; other keys in the file are preserved.

function settingsLocalPath(projectPath: string): string {
  return path.join(projectPath, '.claude', 'settings.local.json');
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function readActiveOutputStyle(projectPath: string): Promise<string | null> {
  const file = settingsLocalPath(projectPath);
  if (!await exists(file)) return null;
  try {
    const doc = JSON.parse(await fs.readFile(file, 'utf-8'));
    return typeof doc.outputStyle === 'string' ? doc.outputStyle : null;
  } catch {
    return null;
  }
}

export async function writeActiveOutputStyle(projectPath: string, name: string): Promise<void> {
  const file = settingsLocalPath(projectPath);
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  let doc: Record<string, unknown> = {};
  if (await exists(file)) {
    try { doc = JSON.parse(await fs.readFile(file, 'utf-8')); } catch { doc = {}; }
  }
  doc.outputStyle = name;
  await fs.writeFile(file, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
}
