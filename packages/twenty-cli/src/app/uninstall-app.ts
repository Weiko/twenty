import { createAppNotInstalledError } from '@/app/create-app-not-installed-error';
import { isApplicationNotFoundError } from '@/app/is-application-not-found-error';
import { CliError } from '@/output/cli-error';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { sendGraphqlRequest } from '@/transport/graphql/send-graphql-request';

const UNINSTALL_MUTATION = `mutation UninstallApplication($universalIdentifier: String!) {
  uninstallApplication(universalIdentifier: $universalIdentifier)
}`;

export const uninstallApp = async ({
  universalIdentifier,
  target,
  signal,
}: {
  universalIdentifier: string;
  target: ResolvedTarget;
  signal: AbortSignal;
}) => {
  const data = await sendGraphqlRequest({
    target,
    signal,
    endpoint: 'metadata',
    query: UNINSTALL_MUTATION,
    variables: { universalIdentifier },
  }).catch((error: unknown) => {
    if (isApplicationNotFoundError({ error, field: 'uninstallApplication' })) {
      throw createAppNotInstalledError({
        universalIdentifier,
        apiUrl: target.apiUrl,
      });
    }

    throw error;
  });

  if (data?.uninstallApplication !== true) {
    throw new CliError({
      code: 'INVALID_RESPONSE',
      message: `The server did not confirm the uninstall of ${universalIdentifier}.`,
    });
  }
};
