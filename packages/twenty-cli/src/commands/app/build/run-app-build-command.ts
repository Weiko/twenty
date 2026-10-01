import { formatBuildSummary } from '@/app/format-build-summary';
import { parseBuildData } from '@/app/parse-tooling-result';
import { runAppOperation } from '@/app/run-app-operation';
import { type CommandRun } from '@/catalog/types/command-run.type';

export const runAppBuildCommand: CommandRun = async (context) => {
  const { project, sdk, data, diagnostics, durationMilliseconds } =
    await runAppOperation({
      operation: 'build',
      parseData: parseBuildData,
      context,
    });

  return {
    data: {
      app: { path: project.path, name: project.name },
      sdk: { version: sdk.version, protocolVersion: sdk.protocolVersion },
      application: data.application,
      contentHash: data.contentHash,
      files: data.files,
      manifestFormat: data.manifestFormat,
      manifest: data.manifest,
      diagnostics,
      durationMilliseconds,
    },
    human: formatBuildSummary({
      build: data,
      sdkVersion: sdk.version,
      pipeline: sdk.pipeline,
      durationMilliseconds,
    }),
  };
};
