import { isPlainObject } from 'twenty-shared/utils';

import { parseAppPlan } from '@/app/parse-app-plan';
import { type ToolingBuild } from '@/app/types/tooling-result.type';
import { CliError } from '@/output/cli-error';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { sendGraphqlRequest } from '@/transport/graphql/send-graphql-request';

const SYNC_MUTATION = `mutation SyncApplication($manifest: JSON!, $inferDeletionFromMissingEntities: Boolean!) {
  syncApplication(manifest: $manifest, inferDeletionFromMissingEntities: $inferDeletionFromMissingEntities) {
    applicationUniversalIdentifier
    actions
  }
}`;

const withoutResponseContent = (error: unknown) => {
  if (!(error instanceof CliError) || !isPlainObject(error.details)) {
    return error;
  }

  const { body: _body, ...details } = error.details;

  return new CliError({
    code: error.code,
    exitCode: error.exitCode,
    message: error.message,
    hint: error.hint,
    details: { ...details, data: null },
  });
};

const readAppliedActions = ({
  value,
  applicationUniversalIdentifier,
}: {
  value: unknown;
  applicationUniversalIdentifier: string;
}) => {
  try {
    return parseAppPlan({ value, applicationUniversalIdentifier });
  } catch (error) {
    if (error instanceof CliError) {
      return undefined;
    }

    throw error;
  }
};

export const syncAppManifest = async ({
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
  const applicationUniversalIdentifier = build.application.universalIdentifier;
  const data = await sendGraphqlRequest({
    target,
    signal,
    endpoint: 'metadata',
    query: SYNC_MUTATION,
    variables: { manifest: build.manifest, inferDeletionFromMissingEntities },
  }).catch((error: unknown) => {
    throw withoutResponseContent(error);
  });
  const acknowledgement = data?.syncApplication;

  if (
    !isPlainObject(acknowledgement) ||
    acknowledgement.applicationUniversalIdentifier !==
      applicationUniversalIdentifier
  ) {
    throw new CliError({
      code: 'INVALID_RESPONSE',
      message: `The server did not confirm the sync of ${applicationUniversalIdentifier}.`,
    });
  }

  return {
    actions: readAppliedActions({
      value: acknowledgement,
      applicationUniversalIdentifier,
    }),
  };
};
