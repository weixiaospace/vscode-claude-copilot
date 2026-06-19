import { agentsDescriptor, type Agent } from '../core/agents';
import { FileResourceTreeProvider } from './file-resource-tree';

export class AgentsTreeProvider extends FileResourceTreeProvider<Agent> {
  constructor() {
    super(agentsDescriptor, {
      icon: 'person',
      userDirLabel: '~/.claude/agents',
      projectDirLabel: '.claude/agents',
      display: (a, t) => {
        const parts: string[] = [];
        if (a.model) parts.push(a.model);
        if (a.tools && a.tools.length) parts.push(t('tree.agent.toolsCount', a.tools.length));
        if (a.color) parts.push(a.color);
        return parts;
      },
      tooltip: a => {
        const lines = [a.description || a.name];
        if (a.model) lines.push(`model: ${a.model}`);
        if (a.tools && a.tools.length) lines.push(`tools: ${a.tools.join(', ')}`);
        if (a.color) lines.push(`color: ${a.color}`);
        lines.push(a.path);
        return lines;
      },
    });
  }
}
