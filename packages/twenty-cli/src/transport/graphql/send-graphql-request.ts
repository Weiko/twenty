import { isNonEmptyArray } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { CliError } from '@/output/cli-error';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { createHttpStatusError } from '@/transport/create-http-status-error';
import { createTargetFetch } from '@/transport/create-target-fetch';
import { GRAPHQL_ENDPOINT_PATHS } from '@/transport/graphql/constants/graphql-endpoint-paths.constant';
import { createGraphqlError } from '@/transport/graphql/create-graphql-error';
import { type GraphqlEndpoint } from '@/transport/graphql/types/graphql-endpoint.type';
import { type GraphqlPayload } from '@/transport/graphql/types/graphql-payload.type';
import { parseResponseBody } from '@/transport/parse-response-body';
import { pickSafeResponseHeaders } from '@/transport/pick-safe-response-headers';
import { resolveRequestUrl } from '@/transport/resolve-request-url';
import { isJsonObject } from '@/utils/is-json-object';

export const sendGraphqlRequest = async ({
  target,
  signal,
  endpoint,
  query,
  variables,
}: {
  target: ResolvedTarget;
  signal: AbortSignal;
  endpoint: GraphqlEndpoint;
  query: string;
  variables?: Record<string, unknown>;
}) => {
  const response = await createTargetFetch({ target, signal })(
    resolveRequestUrl({
      apiUrl: target.apiUrl,
      path: GRAPHQL_ENDPOINT_PATHS[endpoint],
    }),
    {
      method: 'POST',
      headers: {
        Accept: 'application/graphql-response+json, application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    },
  );
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

  return payload.data ?? null;
};
