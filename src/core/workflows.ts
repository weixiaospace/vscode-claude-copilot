import * as path from 'path';
import {
  defineFileResource,
  extractFrontmatter,
  listResource,
  createResource,
  deleteResource,
  type FileResourceItem,
} from './file-resource';

export type WorkflowScope = 'user' | 'project';
export type Workflow = FileResourceItem;

export function userWorkflowsDir(home: string): string {
  return path.join(home, 'workflows');
}
export function projectWorkflowsDir(projectPath: string): string {
  return path.join(projectPath, '.claude', 'workflows');
}

const WORKFLOW_TEMPLATE = (name: string) => `---
name: ${name}
description: <one-line summary of what this workflow does>
---

# ${name}

Describe the steps of this workflow. Claude runs it when the user types /${name}.
`;

export const workflowsDescriptor = defineFileResource<Workflow>({
  kind: 'workflow',
  scopeRoots: {
    user: userWorkflowsDir,
    project: projectWorkflowsDir,
  },
  discovery: 'recursive',
  parse: (filePath, content, scope) => {
    const fm = extractFrontmatter(content);
    return {
      name: path.basename(filePath, '.md'),
      description: fm['description'] ?? '',
      scope,
      path: filePath,
    };
  },
  template: WORKFLOW_TEMPLATE,
  createFilePath: (baseDir, scope, name) =>
    scope === 'user'
      ? path.join(userWorkflowsDir(baseDir), `${name}.md`)
      : path.join(projectWorkflowsDir(baseDir), `${name}.md`),
  deletePath: filePath => filePath,
});

export const listWorkflows = (home: string, projectPath: string | null) =>
  listResource(workflowsDescriptor, home, projectPath);
export const createWorkflow = (baseDir: string, scope: WorkflowScope, name: string) =>
  createResource(workflowsDescriptor, baseDir, scope, name);
export const deleteWorkflow = (workflowFilePath: string) =>
  deleteResource(workflowsDescriptor, workflowFilePath);
