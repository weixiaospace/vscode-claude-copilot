import { skillsDescriptor, type Skill } from '../core/skills';
import { FileResourceTreeProvider } from './file-resource-tree';

export class SkillsTreeProvider extends FileResourceTreeProvider<Skill> {
  constructor() {
    super(skillsDescriptor, {
      icon: 'symbol-event',
      userDirLabel: '~/.claude/skills',
      projectDirLabel: '.claude/skills',
      tooltip: item => [item.description || item.name, item.path],
    });
  }
}
