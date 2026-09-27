import { type CommandDefinition } from '@/catalog/types/command-definition.type';
import { AUTH_LOGIN_COMMAND_DEFINITION } from '@/commands/auth/login/auth-login.command-definition';
import { AUTH_LOGOUT_COMMAND_DEFINITION } from '@/commands/auth/logout/auth-logout.command-definition';
import { AUTH_STATUS_COMMAND_DEFINITION } from '@/commands/auth/status/auth-status.command-definition';
import { AUTH_TOKEN_COMMAND_DEFINITION } from '@/commands/auth/token/auth-token.command-definition';
import { API_GRAPHQL_COMMAND_DEFINITION } from '@/commands/api/graphql/api-graphql.command-definition';
import { API_REST_COMMAND_DEFINITION } from '@/commands/api/rest/api-rest.command-definition';
import { COMMANDS_COMMAND_DEFINITION } from '@/commands/commands/commands.command-definition';
import { METADATA_OBJECT_LIST_COMMAND_DEFINITION } from '@/commands/metadata/object/list/metadata-object-list.command-definition';
import { REMOTE_LIST_COMMAND_DEFINITION } from '@/commands/remote/list/remote-list.command-definition';
import { REMOTE_REMOVE_COMMAND_DEFINITION } from '@/commands/remote/remove/remote-remove.command-definition';
import { REMOTE_RENAME_COMMAND_DEFINITION } from '@/commands/remote/rename/remote-rename.command-definition';
import { REMOTE_USE_COMMAND_DEFINITION } from '@/commands/remote/use/remote-use.command-definition';
import { VERSION_COMMAND_DEFINITION } from '@/commands/version/version.command-definition';

export const COMMAND_CATALOG: CommandDefinition[] = [
  AUTH_LOGIN_COMMAND_DEFINITION,
  AUTH_LOGOUT_COMMAND_DEFINITION,
  AUTH_STATUS_COMMAND_DEFINITION,
  AUTH_TOKEN_COMMAND_DEFINITION,
  REMOTE_LIST_COMMAND_DEFINITION,
  REMOTE_USE_COMMAND_DEFINITION,
  REMOTE_RENAME_COMMAND_DEFINITION,
  REMOTE_REMOVE_COMMAND_DEFINITION,
  API_GRAPHQL_COMMAND_DEFINITION,
  API_REST_COMMAND_DEFINITION,
  COMMANDS_COMMAND_DEFINITION,
  METADATA_OBJECT_LIST_COMMAND_DEFINITION,
  VERSION_COMMAND_DEFINITION,
];
