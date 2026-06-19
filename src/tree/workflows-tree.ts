import { workflowsDescriptor, type Workflow } from '../core/workflows';
import { FileResourceTreeProvider } from './file-resource-tree';

export class WorkflowsTreeProvider extends FileResourceTreeProvider<Workflow> {
  constructor() {
    super(workflowsDescriptor, {
      icon: 'symbol-event',
      userDirLabel: '~/.claude/workflows',
      projectDirLabel: '.claude/workflows',
      tooltip: item => [item.description || item.name, item.path],
    });
  }
}
