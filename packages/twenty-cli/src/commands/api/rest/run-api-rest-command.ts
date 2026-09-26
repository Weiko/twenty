import { isDefined } from 'twenty-shared/utils';

import {
  readStringArgument,
  readStringOption,
} from '@/catalog/read-command-values';
import { type CommandRun } from '@/catalog/types/command-run.type';
import { type TargetCommandContext } from '@/catalog/types/target-command-context.type';
import { formatBody } from '@/commands/api/format-body';
import { parseJsonInput } from '@/input/parse-json-input';
import { readInputValue } from '@/input/read-input-value';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';
import { sendRestRequest } from '@/transport/send-rest-request';

const DEFAULT_METHOD = 'GET';

const readRequestBody = async (
  input: string | undefined,
  signal: AbortSignal,
) => {
  if (!isDefined(input)) {
    return undefined;
  }

  const text = await readInputValue({
    value: input,
    optionName: '--input',
    signal,
  });

  parseJsonInput({ text, optionName: '--input' });

  return text;
};

export const runApiRestCommand: CommandRun<TargetCommandContext> = async ({
  arguments: commandArguments,
  options,
  target,
  signal,
}) => {
  const path = readStringArgument(commandArguments, 0) ?? '';
  const method = readStringOption(options, 'method');
  const input = readStringOption(options, 'input');

  if (isDefined(input) && !isDefined(method)) {
    throw new CliError({
      code: 'USAGE',
      exitCode: EXIT_CODE.USAGE,
      message: 'A request body needs an explicit method.',
      hint: 'Add --method POST, PATCH or PUT.',
    });
  }

  const response = await sendRestRequest({
    target,
    signal,
    method: method ?? DEFAULT_METHOD,
    path,
    body: await readRequestBody(input, signal),
  });

  return { data: response, human: formatBody(response.body) };
};
