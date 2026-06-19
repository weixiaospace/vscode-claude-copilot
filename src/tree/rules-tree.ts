import { rulesDescriptor, type Rule } from '../core/rules';
import { FileResourceTreeProvider } from './file-resource-tree';

export class RulesTreeProvider extends FileResourceTreeProvider<Rule> {
  constructor() {
    super(rulesDescriptor, {
      icon: 'list-tree',
      userDirLabel: '~/.claude/rules',
      projectDirLabel: '.claude/rules',
      display: (r, t) => (r.pathScoped ? [t('tree.rule.scoped')] : []),
      tooltip: r => {
        const lines = [r.name];
        if (r.pathScoped) lines.push('paths-scoped (see file for patterns)');
        lines.push(r.path);
        return lines;
      },
    });
  }
}
