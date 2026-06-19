import * as path from 'path';
import {
  defineFileResource,
  listResource,
  createResource,
  deleteResource,
  type FileResourceItem,
} from './file-resource';

export type RuleScope = 'user' | 'project';

export interface Rule extends FileResourceItem {
  pathScoped: boolean;
}

export function userRulesDir(home: string): string {
  return path.join(home, 'rules');
}
export function projectRulesDir(projectPath: string): string {
  return path.join(projectPath, '.claude', 'rules');
}

const RULE_TEMPLATE = (name: string) => `# ${name}

Describe the rule here. Add a YAML frontmatter block with \`paths:\` to scope this rule to specific files.

Example:

---
paths:
  - "src/**/*.ts"
---
`;

// We don't use extractFrontmatter here because `paths:` is a YAML block list,
// which is multi-line. Instead, we just detect whether the key appears in the
// frontmatter region — that's enough to flag a rule as path-scoped in the UI.
function hasPathsFrontmatter(content: string): boolean {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return false;
  return /^\s*paths:/m.test(match[1] ?? '');
}

export const rulesDescriptor = defineFileResource<Rule>({
  kind: 'rule',
  scopeRoots: {
    user: userRulesDir,
    project: projectRulesDir,
  },
  discovery: 'recursive',
  parse: (filePath, content, scope) => ({
    name: path.basename(filePath, '.md'),
    description: '',
    scope,
    path: filePath,
    pathScoped: hasPathsFrontmatter(content),
  }),
  template: RULE_TEMPLATE,
  createFilePath: (baseDir, scope, name) =>
    scope === 'user'
      ? path.join(userRulesDir(baseDir), `${name}.md`)
      : path.join(projectRulesDir(baseDir), `${name}.md`),
  deletePath: filePath => filePath,
});

export const listRules = (home: string, projectPath: string | null) =>
  listResource(rulesDescriptor, home, projectPath);
export const createRule = (baseDir: string, scope: RuleScope, name: string) =>
  createResource(rulesDescriptor, baseDir, scope, name);
export const deleteRule = (ruleFilePath: string) =>
  deleteResource(rulesDescriptor, ruleFilePath);
