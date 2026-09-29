import { isBoolean, isNonEmptyString } from '@sniptt/guards';
import { isPlainObject } from 'twenty-shared/utils';

import { createAppNotInstalledError } from '@/app/create-app-not-installed-error';
import { isApplicationNotFoundError } from '@/app/is-application-not-found-error';
import { isSameUniversalIdentifier } from '@/app/is-same-universal-identifier';
import { CliError } from '@/output/cli-error';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { sendGraphqlRequest } from '@/transport/graphql/send-graphql-request';

const INSTALLED_APP_QUERY = `query FindInstalledApplication($universalIdentifier: UUID!) {
  findOneApplication(universalIdentifier: $universalIdentifier) {
    name
    universalIdentifier
    canBeUninstalled
  }
}`;

export const fetchInstalledApp = async ({
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
    query: INSTALLED_APP_QUERY,
    variables: { universalIdentifier },
  }).catch((error: unknown) => {
    if (isApplicationNotFoundError({ error, field: 'findOneApplication' })) {
      throw createAppNotInstalledError({
        universalIdentifier,
        apiUrl: target.apiUrl,
      });
    }

    throw error;
  });
  const application = data?.findOneApplication;

  if (
    !isPlainObject(application) ||
    !isNonEmptyString(application.name) ||
    !isSameUniversalIdentifier({
      value: application.universalIdentifier,
      universalIdentifier,
    }) ||
    !isBoolean(application.canBeUninstalled)
  ) {
    throw new CliError({
      code: 'INVALID_RESPONSE',
      message: 'The server returned an invalid installed application.',
    });
  }

  return {
    name: application.name,
    canBeUninstalled: application.canBeUninstalled,
  };
};
