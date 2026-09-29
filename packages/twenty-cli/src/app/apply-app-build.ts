import { createApplyFailure } from '@/app/create-apply-failure';
import { fetchAppPlan } from '@/app/fetch-app-plan';
import { formatAppPlanActions } from '@/app/format-app-plan';
import { getAppPlanSummary } from '@/app/get-app-plan-summary';
import { installDevelopmentApp } from '@/app/install-development-app';
import { registerApp } from '@/app/register-app';
import { resolveSnapshotDirectory } from '@/app/resolve-snapshot-directory';
import { syncAppManifest } from '@/app/sync-app-manifest';
import { type AppApplyPhase } from '@/app/types/app-apply-phase.type';
import { type AppPlanAction } from '@/app/types/app-plan.type';
import { type AppUploadProgress } from '@/app/types/app-upload-progress.type';
import { type ToolingBuild } from '@/app/types/tooling-result.type';
import { uploadAppFiles } from '@/app/upload-app-files';
import { type TargetCommandContext } from '@/catalog/types/target-command-context.type';
import { confirmInTerminal } from '@/input/confirm-in-terminal';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';
import { type CliErrorCode } from '@/output/types/cli-error-code.type';
import { isInteractionAllowed } from '@/program/is-interaction-allowed';

export type AppApplyResult = {
  completedPhases: AppApplyPhase[];
  isRegistrationCreated: boolean;
  appliedActions: AppPlanAction[] | undefined;
  upload: AppUploadProgress;
};

type Approval = {
  isApproved: boolean;
  question: string;
  code: CliErrorCode;
  message: string;
  hint: string;
};

const isPlanUnavailable = (error: unknown) =>
  error instanceof CliError && error.code === 'PLAN_UNAVAILABLE';

export const applyAppBuild = async ({
  build,
  appPath,
  sdkVersion,
  context: { target, signal, output, outputMode, options },
  inferDeletionFromMissingEntities,
  isCreationApproved,
  isDeletionApproved,
}: {
  build: ToolingBuild;
  appPath: string;
  sdkVersion: string;
  context: TargetCommandContext;
  inferDeletionFromMissingEntities: boolean;
  isCreationApproved: boolean;
  isDeletionApproved: boolean;
}): Promise<AppApplyResult> => {
  const completedPhases: AppApplyPhase[] = ['build'];
  const upload: AppUploadProgress = { fileCount: 0, byteCount: 0 };
  const canPrompt = isInteractionAllowed({ options, outputMode });
  const application = build.application;

  const fail = (error: unknown, phase: AppApplyPhase) =>
    createApplyFailure({
      error,
      phase,
      completedPhases,
      uploadedFileCount: upload.fileCount,
      signal,
    });

  const runPhase = async <TResult>(
    phase: AppApplyPhase,
    run: () => Promise<TResult>,
  ) => {
    try {
      const result = await run();

      completedPhases.push(phase);

      return result;
    } catch (error) {
      throw fail(error, phase);
    }
  };

  const requireApproval = async ({
    isApproved,
    question,
    code,
    message,
    hint,
  }: Approval) => {
    if (isApproved) {
      return;
    }

    if (!canPrompt) {
      throw fail(
        new CliError({ code, exitCode: EXIT_CODE.USAGE, message, hint }),
        'confirmation',
      );
    }

    const isConfirmed = await confirmInTerminal({ question, signal }).catch(
      (error: unknown) => {
        throw fail(error, 'confirmation');
      },
    );

    if (!isConfirmed) {
      throw fail(
        new CliError({
          code: 'CONFIRMATION_DECLINED',
          exitCode: EXIT_CODE.USAGE,
          message: 'Apply stopped at the confirmation prompt.',
        }),
        'confirmation',
      );
    }
  };

  const preview = () =>
    fetchAppPlan({ build, inferDeletionFromMissingEntities, target, signal });

  const previewOrBootstrap = async () => {
    try {
      const actions = await preview();

      completedPhases.push('preview');

      return { actions, isRegistrationCreated: false };
    } catch (error) {
      if (!isPlanUnavailable(error)) {
        throw fail(error, 'preview');
      }
    }

    await requireApproval({
      isApproved: isCreationApproved,
      question: `${application.displayName} is not registered. Register it and install it on ${target.apiUrl}?`,
      code: 'CREATE_REQUIRED',
      message: `${application.displayName} has no registration yet. Applying it would create one.`,
      hint: 'Run twenty app apply --create to register it and install it in this workspace.',
    });

    output.progress('Registering the app…');
    await runPhase('registration', () =>
      registerApp({ application, target, signal }),
    );
    output.progress('Installing the development app…');
    await runPhase('installation', () =>
      installDevelopmentApp({ application, target, signal }),
    );
    output.progress('Requesting a preview…');

    return {
      actions: await runPhase('preview', preview),
      isRegistrationCreated: true,
    };
  };

  const snapshotDirectory = resolveSnapshotDirectory({
    build,
    appPath,
    sdkVersion,
  });

  output.progress(`Requesting a fresh preview from ${target.apiUrl}…`);

  const { actions, isRegistrationCreated } = await previewOrBootstrap();
  const summary = getAppPlanSummary(actions);

  if (outputMode === 'human') {
    output.progress(
      formatAppPlanActions({
        actions,
        summary,
        inferDeletionFromMissingEntities,
      }),
    );
  }

  if (summary.destructive > 0) {
    const deletionLabel =
      summary.destructive === 1
        ? 'object or field deletion'
        : 'object or field deletions';

    await requireApproval({
      isApproved: isDeletionApproved,
      question: `Apply ${summary.destructive} ${deletionLabel} that permanently delete stored data on ${target.apiUrl}?`,
      code: 'CONFIRMATION_REQUIRED',
      message: `The preview includes ${summary.destructive} ${deletionLabel}, which permanently delete stored data.`,
      hint: 'Review it with twenty app plan, then pass --yes to apply it, or --no-delete to keep entities missing from source.',
    });
  }

  if (!isRegistrationCreated) {
    await runPhase('installation', () =>
      installDevelopmentApp({ application, target, signal }),
    );
  }

  output.progress(
    `Uploading ${build.files.length} ${build.files.length === 1 ? 'file' : 'files'}…`,
  );
  await runPhase('upload', () =>
    uploadAppFiles({
      build,
      snapshotDirectory,
      target,
      signal,
      progress: upload,
    }),
  );
  output.progress('Synchronizing the app…');

  const { actions: appliedActions } = await runPhase('sync', () =>
    syncAppManifest({
      build,
      inferDeletionFromMissingEntities,
      target,
      signal,
    }),
  );

  return { completedPhases, isRegistrationCreated, appliedActions, upload };
};
