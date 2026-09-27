import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';
import { getAuthenticationHint } from '@/target/get-authentication-hint';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { pickSafeResponseHeaders } from '@/transport/pick-safe-response-headers';
import { type GraphqlErrorEntry } from '@/transport/graphql/types/graphql-payload.type';

const summarizeMessages = (errors: { message: string }[]) =>
  errors.length === 1
    ? errors[0].message
    : `${errors[0].message} (and ${errors.length - 1} more errors)`;

export const createGraphqlError = ({
  errors,
  data,
  status,
  headers,
  target,
}: {
  errors: GraphqlErrorEntry[];
  data: unknown;
  status: number;
  headers: Headers;
  target: ResolvedTarget;
}) => {
  const publicErrors = errors.map(({ message, path, extensions }) => ({
    message: message ?? 'Unknown GraphQL error',
    path: path ?? null,
    code: extensions?.code ?? null,
  }));
  const errorCodes = publicErrors.map((error) => error.code);
  const details = {
    status,
    headers: pickSafeResponseHeaders(headers),
    errors: publicErrors,
    data: data ?? null,
  };

  if (status === 401 || errorCodes.includes('UNAUTHENTICATED')) {
    return new CliError({
      code: 'AUTH_REQUIRED',
      exitCode: EXIT_CODE.AUTHENTICATION,
      message: `${target.apiUrl} rejected the credentials.`,
      hint: getAuthenticationHint(target),
      details,
    });
  }

  if (status === 403 || errorCodes.includes('FORBIDDEN')) {
    return new CliError({
      code: 'PERMISSION_DENIED',
      exitCode: EXIT_CODE.AUTHENTICATION,
      message: summarizeMessages(publicErrors),
      details,
    });
  }

  return new CliError({
    code: 'GRAPHQL_ERROR',
    message: summarizeMessages(publicErrors),
    details,
  });
};
