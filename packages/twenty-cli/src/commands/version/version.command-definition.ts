import { HELP_GROUP } from '@/catalog/constants/help-group.constant';
import { type CommandDefinition } from '@/catalog/types/command-definition.type';

export const VERSION_COMMAND_DEFINITION: CommandDefinition = {
  path: ['version'],
  description: 'Print version information',
  helpGroup: HELP_GROUP.TOOLS,
  outputModes: ['human', 'json'],
  writes: false,
  needsProject: false,
  load: async () =>
    (await import('@/commands/version/run-version-command')).runVersionCommand,
};
