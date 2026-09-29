import { isArray } from '@sniptt/guards';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

import { parseAppPlan } from '@/app/parse-app-plan';
import { type ToolingBuild } from '@/app/types/tooling-result.type';
import { CliError } from '@/output/cli-error';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { sendGraphqlRequest } from '@/transport/graphql/send-graphql-request';

const isMissingApplication = (error: CliError) => {
  const errors = error.details?.errors;

  if (!isArray(errors) || errors.length !== 1) {
    return false;
  }

  const entry: unknown = errors[0];

  return (
    isPlainObject(entry) &&
    entry.code === 'NOT_FOUND' &&
    entry.subCode === 'APPLICATION_NOT_FOUND' &&
    isArray(entry.path) &&
    entry.path[0] === 'syncApplication'
  );
};

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
      error.code === 'GRAPHQL_ERROR' &&
      isMissingApplication(error)
    ) {
      throw new CliError({
        code: 'PLAN_UNAVAILABLE',
        message:
          'This app needs an owned registration before the server can preview it. Nothing was registered, uploaded or synchronized.',
        hint: 'Register the development app in this workspace using the existing twenty-sdk CLI, then retry. The SDK CLI uses its own connection configuration.',
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
