import { isDefined } from 'twenty-shared/utils';

import { createToolingFailure } from '@/app/create-tooling-failure';
import { formatToolingDiagnostic } from '@/app/format-tooling-diagnostic';
import { parseToolingResult } from '@/app/parse-tooling-result';
import { resolveAppProject } from '@/app/resolve-app-project';
import { resolveProjectSdk } from '@/app/resolve-project-sdk';
import { runAppWorker } from '@/app/run-app-worker';
import { toWorkerOutputDiagnostics } from '@/app/to-worker-output-diagnostics';
import { type AppOperation } from '@/app/types/app-operation.type';
import { readStringOption } from '@/catalog/read-command-values';
import { type CommandContext } from '@/catalog/types/command-context.type';
import { isJsonObject } from '@/utils/is-json-object';

const PROGRESS_VERBS: Record<AppOperation, string> = {
  build: 'Building',
  typecheck: 'Typechecking',
};

export const runAppOperation = async <TData>({
  operation,
  parseData,
  context: { options, output, outputMode, signal },
}: {
  operation: AppOperation;
  parseData: (data: unknown) => { data: TData } | undefined;
  context: CommandContext;
}) => {
  const project = await resolveAppProject({
    explicitPath: readStringOption(options, 'path'),
    workingDirectory: process.cwd(),
  });
  const sdk = await resolveProjectSdk({ appPath: project.path, operation });

  output.progress(
    `${PROGRESS_VERBS[operation]} ${project.name} with twenty-sdk ${sdk.version}…`,
  );

  const startedAt = performance.now();
  const workerRun = await runAppWorker({
    operation,
    appPath: project.path,
    buildEntryPath: sdk.buildEntryPath,
    signal,
  });

  signal.throwIfAborted();

  const toolingResult = parseToolingResult({
    value: workerRun.result,
    parseData,
  });
  const diagnostics = [
    ...toolingResult.diagnostics,
    ...toWorkerOutputDiagnostics(workerRun.output),
  ];

  if (outputMode === 'human') {
    for (const diagnostic of diagnostics) {
      output.progress(formatToolingDiagnostic(diagnostic));
    }
  }

  if (!toolingResult.success) {
    throw createToolingFailure({
      error: toolingResult.error,
      diagnostics,
      sdkVersion: sdk.version,
    });
  }

  if (
    isDefined(workerRun.release) &&
    isJsonObject(workerRun.release) &&
    workerRun.release.success === false
  ) {
    output.warn({
      code: 'SNAPSHOT_RELEASE_FAILED',
      message:
        'The temporary build snapshot could not be removed. You can delete .twenty/snapshots once no build is running.',
    });
  }

  return {
    project,
    sdk,
    data: toolingResult.data,
    diagnostics,
    durationMilliseconds: Math.round(performance.now() - startedAt),
  };
};
