import { isNonEmptyArray } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { CliError } from '@/output/cli-error';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { createHttpStatusError } from '@/transport/create-http-status-error';
import { createGraphqlError } from '@/transport/graphql/create-graphql-error';
import { type GraphqlPayload } from '@/transport/graphql/types/graphql-payload.type';
import { parseResponseBody } from '@/transport/parse-response-body';
import { pickSafeResponseHeaders } from '@/transport/pick-safe-response-headers';
import { isJsonObject } from '@/utils/is-json-object';

export const parseGraphqlResponse = async ({
  response,
  target,
}: {
  response: Response;
  target: ResolvedTarget;
}) => {
  const body = await parseResponseBody(response);
  const payload = isJsonObject(body) ? (body as GraphqlPayload) : undefined;

  if (isNonEmptyArray(payload?.errors)) {
    throw createGraphqlError({
      errors: payload.errors,
      data: payload.data,
      status: response.status,
      headers: response.headers,
      target,
    });
  }

  if (!response.ok) {
    throw createHttpStatusError({
      status: response.status,
      headers: response.headers,
      body,
      target,
    });
  }

  if (!isDefined(payload) || !('data' in payload)) {
    throw new CliError({
      code: 'INVALID_RESPONSE',
      message: 'The server answered without a GraphQL result.',
      details: {
        status: response.status,
        headers: pickSafeResponseHeaders(response.headers),
        body,
      },
    });
  }

  return payload;
};
