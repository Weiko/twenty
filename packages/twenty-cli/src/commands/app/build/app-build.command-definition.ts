import { APP_LEGACY_SDK_OPTION } from '@/app/constants/app-legacy-sdk-option.constant';
import { type LocalCommandDefinition } from '@/catalog/types/command-definition.type';

export const APP_BUILD_COMMAND_DEFINITION: LocalCommandDefinition = {
  path: ['app', 'build'],
  description: 'Build the app with the CLI and report the artifacts',
  options: [
    APP_LEGACY_SDK_OPTION,
    {
      flags: '--path <directory>',
      description:
        'App directory (default: the app containing the current folder)',
    },
  ],
  examples: [
    'twenty app build',
    'twenty app build --path ./apps/billing --json',
  ],
  outputModes: ['human', 'json'],
  writes: false,
  needsProject: true,
  needsTarget: false,
  load: async () =>
    (await import('@/commands/app/build/run-app-build-command'))
      .runAppBuildCommand,
};
