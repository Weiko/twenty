import { isDefined, isPlainObject } from 'twenty-shared/utils';

import { isApplicationNotFoundError } from '@/app/is-application-not-found-error';
import { parseAppPlan } from '@/app/parse-app-plan';
import { type ToolingBuild } from '@/app/types/tooling-result.type';
import { CliError } from '@/output/cli-error';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { sendGraphqlRequest } from '@/transport/graphql/send-graphql-request';

export const fetchAppPlan = async ({
  build,
  inferDeletionFromMissingEntities,
  target,
  signal,
}: {
  build: ToolingBuild;
  inferDeletionFromMissingEntities: boolean;
  target: ResolvedTarget;
  signal: AbortSignal;
}) => {
  if (
    build.manifestFormat !== 'twenty-application' ||
    !isPlainObject(build.manifest.application) ||
    build.manifest.application.universalIdentifier !==
      build.application.universalIdentifier
  ) {
    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message: 'This CLI cannot preview the manifest returned by the SDK.',
    });
  }

  try {
    const data = await sendGraphqlRequest({
      target,
      signal,
      endpoint: 'metadata',
      query: `mutation PreviewApplication($manifest: JSON!, $inferDeletionFromMissingEntities: Boolean!) {
        syncApplication(manifest: $manifest, dryRun: true, inferDeletionFromMissingEntities: $inferDeletionFromMissingEntities) {
          applicationUniversalIdentifier
          actions
        }
      }`,
      variables: { manifest: build.manifest, inferDeletionFromMissingEntities },
    });

    return parseAppPlan({
      value: data?.syncApplication,
      applicationUniversalIdentifier: build.application.universalIdentifier,
    });
  } catch (error) {
    if (
      error instanceof CliError &&
      isApplicationNotFoundError({ error, field: 'syncApplication' })
    ) {
      throw new CliError({
        code: 'PLAN_UNAVAILABLE',
        message:
          'This app needs an owned registration before the server can preview it. Nothing was registered, uploaded or synchronized.',
        hint: 'Run twenty app apply --create to register it and install it in this workspace.',
        details: {
          ...error.details,
          data: null,
          applicationUniversalIdentifier: build.application.universalIdentifier,
          advisory: true,
        },
      });
    }

    if (error instanceof CliError && isDefined(error.details?.data)) {
      throw new CliError({
        code: error.code,
        exitCode: error.exitCode,
        message: error.message,
        hint: error.hint,
        details: { ...error.details, data: null },
      });
    }

    throw error;
  }
};
