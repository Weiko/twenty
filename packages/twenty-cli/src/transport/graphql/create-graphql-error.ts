import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';
import { getAuthenticationHint } from '@/target/get-authentication-hint';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { type GraphqlErrorEntry } from '@/transport/graphql/types/graphql-payload.type';

const summarizeMessages = (errors: { message: string }[]) =>
  errors.length === 1
    ? errors[0].message
    : `${errors[0].message} (and ${errors.length - 1} more errors)`;

export const createGraphqlError = ({
  errors,
  data,
  status,
  target,
}: {
  errors: GraphqlErrorEntry[];
  data: unknown;
  status: number;
  target: ResolvedTarget;
}) => {
  const publicErrors = errors.map(({ message, path, extensions }) => ({
    message: message ?? 'Unknown GraphQL error',
    path: path ?? null,
    code: extensions?.code ?? null,
  }));
  const errorCodes = publicErrors.map((error) => error.code);
  const details = { status, errors: publicErrors, data: data ?? null };

  if (errorCodes.includes('UNAUTHENTICATED')) {
    return new CliError({
      code: 'AUTH_REQUIRED',
      exitCode: EXIT_CODE.AUTHENTICATION,
      message: `${target.apiUrl} rejected the credentials.`,
      hint: getAuthenticationHint(target),
      details,
    });
  }

  if (errorCodes.includes('FORBIDDEN')) {
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
