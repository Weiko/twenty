import { isDefined } from 'twenty-shared/utils';

import {
  readBooleanOption,
  readStringArgument,
} from '@/catalog/read-command-values';
import { type CommandRun } from '@/catalog/types/command-run.type';
import { type TargetCommandContext } from '@/catalog/types/target-command-context.type';
import { parseWorkspacePage } from '@/commands/open/parse-workspace-page';
import { openBrowser } from '@/oauth/open-browser';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';
import { isInteractionAllowed } from '@/program/is-interaction-allowed';
import { fetchWorkspaceUrl } from '@/transport/metadata/fetch-workspace-url';

export const runOpenCommand: CommandRun<TargetCommandContext> = async ({
  arguments: commandArguments,
  options,
  outputMode,
  target,
  signal,
}) => {
  const isUrlOnly = readBooleanOption(options, 'urlOnly');
  const page = readStringArgument(commandArguments, 0);
  const pagePath = isDefined(page) ? parseWorkspacePage(page) : '/';

  if (!isUrlOnly && !isInteractionAllowed({ options, outputMode })) {
    throw new CliError({
      code: 'USAGE',
      exitCode: EXIT_CODE.USAGE,
      message:
        'twenty open only opens a browser in an interactive terminal, not with --no-input, JSON output, redirected stdin or in CI.',
      hint: 'Add --url-only to print the address instead.',
    });
  }

  const url = new URL(pagePath, await fetchWorkspaceUrl({ target, signal }))
    .href;

  if (isUrlOnly) {
    return { data: { url }, human: url };
  }

  openBrowser(url);

  return { data: { url }, human: `Opening ${url} in your browser.` };
};
