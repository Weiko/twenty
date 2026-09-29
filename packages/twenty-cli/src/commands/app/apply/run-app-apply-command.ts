import { isDefined } from 'twenty-shared/utils';

import { type AppApplyResult, applyAppBuild } from '@/app/apply-app-build';
import { formatApplySummary } from '@/app/format-apply-summary';
import { getAppPlanSummary } from '@/app/get-app-plan-summary';
import { parseBuildData } from '@/app/parse-tooling-result';
import { runAppOperation } from '@/app/run-app-operation';
import { readBooleanOption } from '@/catalog/read-command-values';
import { type CommandRun } from '@/catalog/types/command-run.type';
import { type TargetCommandContext } from '@/catalog/types/target-command-context.type';
import { CliError } from '@/output/cli-error';

export const runAppApplyCommand: CommandRun<TargetCommandContext> = async (
  context,
) => {
  const startedAt = performance.now();
  const inferDeletionFromMissingEntities = context.options.delete !== false;
  let applyResult: AppApplyResult | undefined;

  const {
    project,
    sdk,
    data: build,
    diagnostics,
  } = await runAppOperation({
    operation: 'build',
    parseData: parseBuildData,
    context,
    useHeldBuild: async (heldBuild) => {
      applyResult = await applyAppBuild({
        build: heldBuild.data,
        appPath: heldBuild.project.path,
        sdkVersion: heldBuild.sdk.version,
        context,
        inferDeletionFromMissingEntities,
        isCreationApproved: readBooleanOption(context.options, 'create'),
        isDeletionApproved: readBooleanOption(context.options, 'yes'),
      });
    },
  });

  if (!isDefined(applyResult)) {
    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message: `twenty-sdk ${sdk.version} did not keep its build snapshot for upload, so nothing was applied.`,
    });
  }

  const summary = isDefined(applyResult.appliedActions)
    ? getAppPlanSummary(applyResult.appliedActions)
    : undefined;
  const durationMilliseconds = Math.round(performance.now() - startedAt);

  if (!isDefined(summary)) {
    context.output.warn({
      code: 'SYNC_REPORT_UNAVAILABLE',
      message:
        'The sync succeeded, but the server did not return a readable list of its changes.',
    });
  }

  context.output.warn({
    code: 'CLIENT_NOT_GENERATED',
    message: `The app's typed API client was not regenerated: twenty-sdk ${sdk.version} cannot generate it for the CLI yet.`,
  });

  return {
    data: {
      app: { path: project.path, name: project.name },
      sdk: { version: sdk.version, protocolVersion: sdk.protocolVersion },
      application: build.application,
      contentHash: build.contentHash,
      inferDeletionFromMissingEntities,
      registrationCreated: applyResult.isRegistrationCreated,
      completedPhases: applyResult.completedPhases,
      actions: applyResult.appliedActions ?? null,
      summary: summary ?? null,
      upload: {
        fileCount: applyResult.upload.fileCount,
        byteCount: applyResult.upload.byteCount,
      },
      clientGeneration: 'skipped',
      diagnostics,
      durationMilliseconds,
    },
    human: formatApplySummary({
      applicationName: build.application.displayName,
      apiUrl: context.target.apiUrl,
      summary,
      upload: applyResult.upload,
      isRegistrationCreated: applyResult.isRegistrationCreated,
      durationMilliseconds,
    }),
  };
};
