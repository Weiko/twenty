import { type CommandRun } from '@/catalog/types/command-run.type';
import { type OutputMode } from '@/output/types/output-mode.type';

export type CommandDefinition = {
  path: string[];
  description: string;
  helpGroup?: string;
  outputModes: OutputMode[];
  writes: boolean;
  needsProject: boolean;
  load: () => Promise<CommandRun>;
};
