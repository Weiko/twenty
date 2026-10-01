import { type CommandOptionDefinition } from '@/catalog/types/command-option-definition.type';

export const APP_LEGACY_SDK_OPTION: CommandOptionDefinition = {
  flags: '--legacy-sdk',
  description: 'Use the legacy SDK build pipeline for migration comparisons',
  hidden: true,
};
