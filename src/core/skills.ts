import * as path from 'path';
import {
  defineFileResource,
  extractFrontmatter,
  listResource,
  createResource,
  deleteResource,
  type FileResourceItem,
} from './file-resource';

export type SkillScope = 'user' | 'project';
export type Skill = FileResourceItem;

export function userSkillsDir(home: string): string {
  return path.join(home, 'skills');
}
export function projectSkillsDir(projectPath: string): string {
  return path.join(projectPath, '.claude', 'skills');
}

const SKILL_TEMPLATE = (name: string) => `---
name: ${name}
description: <one-line trigger description>
---

# ${name}

Describe what this skill does.
`;

export const skillsDescriptor = defineFileResource<Skill>({
  kind: 'skill',
  scopeRoots: {
    user: userSkillsDir,
    project: projectSkillsDir,
  },
  discovery: { kind: 'flat-subdirs', basename: 'SKILL.md' },
  parse: (filePath, content, scope) => {
    const fm = extractFrontmatter(content);
    return {
      name: path.basename(path.dirname(filePath)),
      description: fm['description'] ?? '',
      scope,
      path: filePath,
    };
  },
  template: SKILL_TEMPLATE,
  createFilePath: (baseDir, scope, name) =>
    scope === 'user'
      ? path.join(userSkillsDir(baseDir), name, 'SKILL.md')
      : path.join(projectSkillsDir(baseDir), name, 'SKILL.md'),
  deletePath: filePath => path.dirname(filePath),
});

export const listSkills = (home: string, projectPath: string | null) =>
  listResource(skillsDescriptor, home, projectPath);
export const createSkill = (baseDir: string, scope: SkillScope, name: string) =>
  createResource(skillsDescriptor, baseDir, scope, name);
export const deleteSkill = (skillFilePath: string) =>
  deleteResource(skillsDescriptor, skillFilePath);
