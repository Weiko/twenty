import { isNonEmptyString } from '@sniptt/guards';

import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';
import { getAuthenticationHint } from '@/target/get-authentication-hint';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { isJsonObject } from '@/utils/is-json-object';

const findServerMessage = (body: unknown) => {
  if (!isJsonObject(body)) {
    return undefined;
  }

  const messages = body.messages;

  if (Array.isArray(messages) && isNonEmptyString(messages[0])) {
    return messages[0];
  }

  return isNonEmptyString(body.message) ? body.message : undefined;
};

export const createHttpStatusError = ({
  status,
  body,
  target,
}: {
  status: number;
  body: unknown;
  target: ResolvedTarget;
}) => {
  const serverMessage = findServerMessage(body);
  const details = { status, body };

  if (status === 401) {
    return new CliError({
      code: 'AUTH_REQUIRED',
      exitCode: EXIT_CODE.AUTHENTICATION,
      message: `${target.apiUrl} rejected the credentials.`,
      hint: getAuthenticationHint(target),
      details,
    });
  }

  if (status === 403) {
    return new CliError({
      code: 'PERMISSION_DENIED',
      exitCode: EXIT_CODE.AUTHENTICATION,
      message: serverMessage ?? 'Access denied.',
      details,
    });
  }

  if (status === 404) {
    return new CliError({
      code: 'NOT_FOUND',
      exitCode: EXIT_CODE.NOT_FOUND,
      message: serverMessage ?? 'Not found.',
      details,
    });
  }

  if (status === 409) {
    return new CliError({
      code: 'CONFLICT',
      exitCode: EXIT_CODE.CONFLICT,
      message: serverMessage ?? 'The request conflicts with the current state.',
      details,
    });
  }

  return new CliError({
    code: 'HTTP_ERROR',
    message: `The server answered ${status}${isNonEmptyString(serverMessage) ? `: ${serverMessage}` : '.'}`,
    details,
  });
};
