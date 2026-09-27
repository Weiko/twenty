import { type CliError } from '@/output/cli-error';
import { type CliWarning } from '@/output/types/cli-warning.type';
import { type CommandResult } from '@/output/types/command-result.type';

export type Output = {
  warn: (warning: CliWarning) => void;
  succeed: (result: CommandResult) => void;
  fail: (error: CliError) => void;
};
