import { formatAppDuration } from '@/app/format-app-duration';
import { parseNullData } from '@/app/parse-tooling-result';
import { runAppOperation } from '@/app/run-app-operation';
import { type CommandRun } from '@/catalog/types/command-run.type';
import { dimText, formatSuccessLine } from '@/output/style';

export const runAppTypecheckCommand: CommandRun = async (context) => {
  const { project, sdk, diagnostics, durationMilliseconds } =
    await runAppOperation({
      operation: 'typecheck',
      parseData: parseNullData,
      context,
    });

  return {
    data: {
      app: { path: project.path, name: project.name },
      sdk: { version: sdk.version, protocolVersion: sdk.protocolVersion },
      diagnostics,
      durationMilliseconds,
    },
    human: formatSuccessLine(
      `No type errors in ${project.name} ${dimText(`· twenty-sdk ${sdk.version} · ${formatAppDuration(durationMilliseconds)}`)}`,
    ),
  };
};
