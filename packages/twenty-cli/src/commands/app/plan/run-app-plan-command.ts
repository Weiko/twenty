import { fetchAppPlan } from '@/app/fetch-app-plan';
import { formatAppPlan } from '@/app/format-app-plan';
import { getAppPlanSummary } from '@/app/get-app-plan-summary';
import { parseBuildData } from '@/app/parse-tooling-result';
import { runAppOperation } from '@/app/run-app-operation';
import { type CommandRun } from '@/catalog/types/command-run.type';
import { type TargetCommandContext } from '@/catalog/types/target-command-context.type';

export const runAppPlanCommand: CommandRun<TargetCommandContext> = async (
  context,
) => {
  const startedAt = performance.now();
  const {
    project,
    sdk,
    data: build,
    diagnostics,
  } = await runAppOperation({
    operation: 'build',
    parseData: parseBuildData,
    context,
  });
  const inferDeletionFromMissingEntities = context.options.delete !== false;

  context.output.progress(
    'Computing metadata plan (read-only, nothing will be applied)…',
  );

  const actions = await fetchAppPlan({
    build,
    inferDeletionFromMissingEntities,
    target: context.target,
    signal: context.signal,
  });
  const summary = getAppPlanSummary(actions);

  return {
    data: {
      app: { path: project.path, name: project.name },
      sdk: { version: sdk.version },
      application: build.application,
      contentHash: build.contentHash,
      plan: true,
      inferDeletionFromMissingEntities,
      actions,
      summary,
      diagnostics,
      durationMilliseconds: Math.round(performance.now() - startedAt),
    },
    human: formatAppPlan({
      applicationName: build.application.displayName,
      apiUrl: context.target.apiUrl,
      actions,
      summary,
      inferDeletionFromMissingEntities,
    }),
  };
};
