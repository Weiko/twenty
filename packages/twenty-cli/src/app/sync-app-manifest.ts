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
  const data = await sendGraphqlRequest({
    target,
    signal,
    endpoint: 'metadata',
    query: SYNC_MUTATION,
    variables: { manifest: build.manifest, inferDeletionFromMissingEntities },
  });
  return {
    actions: readAppliedActions({
      value: data?.syncApplication,
      applicationUniversalIdentifier: build.application.universalIdentifier,
    }),
  };
};
