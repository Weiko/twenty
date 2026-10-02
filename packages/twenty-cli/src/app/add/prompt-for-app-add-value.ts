import { createInterface } from 'node:readline/promises';

import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';

export const promptForAppAddValue = async ({
  question,
  signal,
}: {
  question: string;
  signal: AbortSignal;
}): Promise<string> => {
  signal.throwIfAborted();

  const terminal = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort();

  terminal.on('SIGINT', cancel);
  terminal.on('close', cancel);

  try {
    return await terminal.question(question, {
      signal: AbortSignal.any([signal, cancellation.signal]),
    });
  } catch (error) {
    if (signal.aborted || cancellation.signal.aborted) {
      throw new CliError({
        code: 'CANCELLED',
        exitCode: EXIT_CODE.CANCELLED,
        message: 'Cancelled.',
      });
    }

    throw error;
  } finally {
    terminal.close();
  }
};
