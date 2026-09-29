import { isNonEmptyString } from '@sniptt/guards';
import { isPlainObject } from 'twenty-shared/utils';

import { isSameUniversalIdentifier } from '@/app/is-same-universal-identifier';
import { type ToolingBuild } from '@/app/types/tooling-result.type';
import { CliError } from '@/output/cli-error';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { sendGraphqlRequest } from '@/transport/graphql/send-graphql-request';

const REGISTER_MUTATION = `mutation RegisterApplication($input: CreateApplicationRegistrationInput!) {
  createApplicationRegistration(input: $input) {
    applicationRegistration {
      id
      universalIdentifier
    }
  }
}`;

export const registerApp = async ({
  application,
  target,
  signal,
}: {
  application: ToolingBuild['application'];
  target: ResolvedTarget;
  signal: AbortSignal;
}) => {
  const data = await sendGraphqlRequest({
    target,
    signal,
    endpoint: 'metadata',
    query: REGISTER_MUTATION,
    variables: {
      input: {
        name: application.displayName,
        universalIdentifier: application.universalIdentifier,
      },
    },
  });
  const created = data?.createApplicationRegistration;
  const registration = isPlainObject(created)
    ? created.applicationRegistration
    : undefined;

  if (
    !isPlainObject(registration) ||
    !isNonEmptyString(registration.id) ||
    !isSameUniversalIdentifier({
      value: registration.universalIdentifier,
      universalIdentifier: application.universalIdentifier,
    })
  ) {
    throw new CliError({
      code: 'INVALID_RESPONSE',
      message: 'The server returned an invalid application registration.',
    });
  }

  return { registrationId: registration.id };
};
