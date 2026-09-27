import { type CommandDefinition } from '@/catalog/types/command-definition.type';
import { COMMANDS_COMMAND_DEFINITION } from '@/commands/commands/commands.command-definition';
import { VERSION_COMMAND_DEFINITION } from '@/commands/version/version.command-definition';

export const COMMAND_CATALOG: CommandDefinition[] = [
  COMMANDS_COMMAND_DEFINITION,
  VERSION_COMMAND_DEFINITION,
];
