import { type CommanderError } from 'commander';
import { isDefined } from 'twenty-shared/utils';

import { VERSION_COMMAND_DEFINITION } from '@/commands/version/version.command-definition';
import { createLegacyCommandError } from '@/legacy/create-legacy-command-error';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';
import { createOutput } from '@/output/create-output';
import { type OutputMode } from '@/output/types/output-mode.type';
import { type CommandParseError } from '@/program/command-parse-error';
import { ROOT_COMMAND_NAME } from '@/program/constants/root-command-name.constant';
import { runCommand } from '@/program/run-command';

const HELP_ERROR_CODES = new Set(['commander.help', 'commander.helpDisplayed']);

const formatCommanderMessage = (message: string) => {
  const flattenedMessage = message
    .replace(/^error: /, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

  return `${flattenedMessage.charAt(0).toUpperCase()}${flattenedMessage.slice(1)}`;
};

const getFullCommandName = (commandName: string) =>
  commandName === ROOT_COMMAND_NAME
    ? ROOT_COMMAND_NAME
    : `${ROOT_COMMAND_NAME} ${commandName}`;

const createUsageError = (
  commanderError: CommanderError,
  commandName: string,
) =>
  new CliError({
    code: 'USAGE',
    exitCode: EXIT_CODE.USAGE,
    message: formatCommanderMessage(commanderError.message),
    hint: `See: ${getFullCommandName(commandName)} --help`,
  });

const createLegacyCommandErrorFromOperands = (
  commandName: string,
  [unknownCommandName, ...remainingArguments]: string[],
) =>
  createLegacyCommandError({
    legacyCommand:
      commandName === ROOT_COMMAND_NAME
        ? unknownCommandName
        : `${commandName} ${unknownCommandName}`,
    remainingArguments,
  });

export const handleParseError = async ({
  error,
  outputMode,
  capturedOutput,
}: {
  error: CommandParseError;
  outputMode: OutputMode;
  capturedOutput: { out: string; err: string };
}) => {
  const { commanderError, commandName, unknownCommandArguments } = error;

  if (commanderError.code === 'commander.version') {
    await runCommand({
      definition: VERSION_COMMAND_DEFINITION,
      outputMode,
      commandArguments: [],
      options: {},
    });

    return;
  }

  const output = createOutput({ mode: outputMode, command: commandName });

  if (HELP_ERROR_CODES.has(commanderError.code)) {
    const help = capturedOutput.out || capturedOutput.err;

    output.succeed({ data: { help }, human: help });

    return;
  }

  const legacyCommandError = isDefined(unknownCommandArguments)
    ? createLegacyCommandErrorFromOperands(commandName, unknownCommandArguments)
    : undefined;

  output.fail(
    legacyCommandError ?? createUsageError(commanderError, commandName),
  );
};
