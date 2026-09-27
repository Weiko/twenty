import { getCommandName } from '@/catalog/get-command-name';
import { type CommandDefinition } from '@/catalog/types/command-definition.type';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';
import { createOutput } from '@/output/create-output';
import { toCliError } from '@/output/to-cli-error';
import { type OutputMode } from '@/output/types/output-mode.type';

export const runCommand = async ({
  definition,
  outputMode,
  commandArguments,
  options,
}: {
  definition: CommandDefinition;
  outputMode: OutputMode;
  commandArguments: unknown[];
  options: Record<string, unknown>;
}) => {
  const command = getCommandName(definition);
  const output = createOutput({ mode: outputMode, command });
  const abortController = new AbortController();
  const abortOnInterrupt = () => abortController.abort();

  process.once('SIGINT', abortOnInterrupt);

  try {
    if (!definition.outputModes.includes(outputMode)) {
      throw new CliError({
        code: 'USAGE',
        exitCode: EXIT_CODE.USAGE,
        message: `twenty ${command} does not support ${outputMode} output.`,
        hint: `Supported: ${definition.outputModes.join(', ')}`,
      });
    }

    const run = await definition.load();

    output.succeed(
      await run({
        command,
        arguments: commandArguments,
        options,
        output,
        signal: abortController.signal,
      }),
    );
  } catch (error) {
    output.fail(toCliError(error, abortController.signal));
  } finally {
    process.off('SIGINT', abortOnInterrupt);
  }
};
