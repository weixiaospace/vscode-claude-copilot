import * as fs from 'fs/promises';
import * as path from 'path';

export type SkillScope = 'user' | 'project';

export interface Skill {
  name: string;
  description: string;
  scope: SkillScope;
  path: string; // full path to SKILL.md
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

function extractFrontmatterField(content: string, key: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return '';
  const line = match[1]?.split('\n').find(l => l.startsWith(`${key}:`));
  return line ? line.slice(key.length + 1).trim() : '';
}

async function scanDir(dir: string, scope: SkillScope): Promise<Skill[]> {
  if (!await exists(dir)) return [];
  const result: Skill[] = [];
  for (const name of await fs.readdir(dir)) {
    const skillFile = path.join(dir, name, 'SKILL.md');
    if (!await exists(skillFile)) continue;
    const content = await fs.readFile(skillFile, 'utf-8');
    result.push({
      name,
      description: extractFrontmatterField(content, 'description'),
      scope,
      path: skillFile,
    });
  }
  return result;
}

export function userSkillsDir(home: string): string {
  return path.join(home, 'skills');
}
export function projectSkillsDir(projectPath: string): string {
  return path.join(projectPath, '.claude', 'skills');
}

export async function listSkills(home: string, projectPath: string | null): Promise<Skill[]> {
  const userSkills = await scanDir(userSkillsDir(home), 'user');
  const projectSkills = projectPath ? await scanDir(projectSkillsDir(projectPath), 'project') : [];
  return [...userSkills, ...projectSkills];
}

const SKILL_TEMPLATE = (name: string) => `---
name: ${name}
description: <one-line trigger description>
---

# ${name}

Describe what this skill does.
`;

export async function createSkill(baseDir: string, scope: SkillScope, name: string): Promise<string> {
  const dir = scope === 'user'
    ? path.join(userSkillsDir(baseDir), name)
    : path.join(projectSkillsDir(baseDir), name);
  await fs.mkdir(dir, { recursive: true });
  const skillFile = path.join(dir, 'SKILL.md');
  await fs.writeFile(skillFile, SKILL_TEMPLATE(name), 'utf-8');
  return skillFile;
}

export async function deleteSkill(skillFilePath: string): Promise<void> {
  await fs.rm(path.dirname(skillFilePath), { recursive: true, force: true });
}
