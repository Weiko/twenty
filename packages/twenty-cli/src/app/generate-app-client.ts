import { isNonEmptyString, isNull } from '@sniptt/guards';

import { createToolingFailure } from '@/app/create-tooling-failure';
import { formatToolingDiagnostic } from '@/app/format-tooling-diagnostic';
import { parseToolingResult } from '@/app/parse-tooling-result';
import { runAppWorker } from '@/app/run-app-worker';
import { toWorkerOutputDiagnostics } from '@/app/to-worker-output-diagnostics';
import { type ProjectSdk } from '@/app/types/project-sdk.type';
import { type TargetCommandContext } from '@/catalog/types/target-command-context.type';
import { CliError } from '@/output/cli-error';
import { sendGraphqlRequest } from '@/transport/graphql/send-graphql-request';

const SCHEMA_QUERY = `query ApplicationCoreGraphqlSchema($applicationUniversalIdentifier: String!) {
  applicationCoreGraphqlSchema(applicationUniversalIdentifier: $applicationUniversalIdentifier)
}`;

export const generateAppClient = async ({
  appPath,
  applicationUniversalIdentifier,
  sdk,
  context: { target, signal, output, outputMode },
}: {
  appPath: string;
  applicationUniversalIdentifier: string;
  sdk: ProjectSdk;
  context: TargetCommandContext;
}) => {
  output.progress('Fetching the application schema…');

  const data = await sendGraphqlRequest({
    target,
    signal,
    endpoint: 'metadata',
    query: SCHEMA_QUERY,
    variables: { applicationUniversalIdentifier },
  });
  const schema = data?.applicationCoreGraphqlSchema;

  if (!isNonEmptyString(schema) || schema.trim().length === 0) {
    throw new CliError({
      code: 'INVALID_RESPONSE',
      message: 'The server did not return an application GraphQL schema.',
    });
  }

  output.progress('Generating the typed API client…');

  const workerRun = await runAppWorker({
    request: {
      type: 'generateClient',
      appPath,
      buildEntryPath: sdk.buildEntryPath,
      schema,
    },
    signal,
  });
  const result = parseToolingResult({
    value: workerRun.result,
    parseData: (value) => (isNull(value) ? { data: null } : undefined),
  });
  const diagnostics = [
    ...result.diagnostics,
    ...toWorkerOutputDiagnostics(workerRun.output),
  ];

  if (outputMode === 'human') {
    for (const diagnostic of diagnostics) {
      output.progress(formatToolingDiagnostic(diagnostic));
    }
  }

  if (!result.success) {
    throw createToolingFailure({
      error: result.error,
      diagnostics,
      sdkVersion: sdk.version,
      operation: 'generateClient',
    });
  }

  signal.throwIfAborted();

  return diagnostics;
};
