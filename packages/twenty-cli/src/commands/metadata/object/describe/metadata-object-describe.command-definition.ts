import { type TargetCommandDefinition } from '@/catalog/types/command-definition.type';

export const METADATA_OBJECT_DESCRIBE_COMMAND_DEFINITION: TargetCommandDefinition =
  {
    path: ['metadata', 'object', 'describe'],
    description: 'Describe an object and its fields',
    arguments: [
      {
        name: 'object',
        description: 'Exact singular or plural API name',
        required: true,
      },
    ],
    options: [{ flags: '--all', description: 'Include system fields' }],
    examples: [
      'twenty metadata object describe companies',
      'twenty metadata object describe person --all --json',
    ],
    outputModes: ['human', 'json'],
    writes: false,
    needsProject: false,
    needsTarget: true,
    load: async () =>
      (
        await import('@/commands/metadata/object/describe/run-metadata-object-describe-command')
      ).runMetadataObjectDescribeCommand,
  };
