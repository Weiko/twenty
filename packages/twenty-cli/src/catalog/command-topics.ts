import { HELP_GROUP } from '@/catalog/constants/help-group.constant';
import { type CommandTopicDefinition } from '@/catalog/types/command-topic-definition.type';

export const COMMAND_TOPICS: CommandTopicDefinition[] = [
  {
    path: ['metadata'],
    description: 'Inspect the data model',
    helpGroup: HELP_GROUP.WORKSPACE,
  },
  {
    path: ['metadata', 'object'],
    description: 'Objects',
  },
  {
    path: ['api'],
    description: 'Send raw REST and GraphQL requests',
    helpGroup: HELP_GROUP.WORKSPACE,
  },
];
