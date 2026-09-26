import { HELP_GROUP } from '@/catalog/constants/help-group.constant';
import { type CommandDefinition } from '@/catalog/types/command-definition.type';

export const COMMANDS_COMMAND_DEFINITION: CommandDefinition = {
  path: ['commands'],
  description: 'List the available commands',
  helpGroup: HELP_GROUP.TOOLS,
  outputModes: ['human', 'json'],
  writes: false,
  needsProject: false,
  load: async () =>
    (await import('@/commands/commands/run-commands-command'))
      .runCommandsCommand,
};
