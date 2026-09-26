import { type CommandDefinition } from '@/catalog/types/command-definition.type';
import { API_GRAPHQL_COMMAND_DEFINITION } from '@/commands/api/graphql/api-graphql.command-definition';
import { API_REST_COMMAND_DEFINITION } from '@/commands/api/rest/api-rest.command-definition';
import { COMMANDS_COMMAND_DEFINITION } from '@/commands/commands/commands.command-definition';
import { VERSION_COMMAND_DEFINITION } from '@/commands/version/version.command-definition';

export const COMMAND_CATALOG: CommandDefinition[] = [
  API_GRAPHQL_COMMAND_DEFINITION,
  API_REST_COMMAND_DEFINITION,
  COMMANDS_COMMAND_DEFINITION,
  VERSION_COMMAND_DEFINITION,
];
