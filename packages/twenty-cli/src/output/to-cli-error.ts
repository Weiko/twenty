import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';

export const toCliError = (error: unknown, signal?: AbortSignal): CliError => {
  if (error instanceof CliError) {
    return error;
  }

  if (signal?.aborted === true) {
    return new CliError({
      code: 'CANCELLED',
      message: 'Cancelled.',
      exitCode: EXIT_CODE.CANCELLED,
    });
  }

  return new CliError({
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : String(error),
  });
};
