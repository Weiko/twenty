import { isDefined } from 'twenty-shared/utils';

import { CliError } from '@/output/cli-error';

const createResponseLimitError = (byteLimit: number) =>
  new CliError({
    code: 'RESPONSE_LIMIT_EXCEEDED',
    message: `The response is larger than ${byteLimit / 1024 / 1024} MiB.`,
    hint: 'Ask for less data, for example a smaller page or fewer fields.',
    details: { byteLimit },
  });

export const readBoundedBody = async (
  response: Response,
  byteLimit: number,
) => {
  const declaredLength = Number(response.headers.get('content-length'));

  if (Number.isFinite(declaredLength) && declaredLength > byteLimit) {
    await response.body?.cancel();

    throw createResponseLimitError(byteLimit);
  }

  if (!isDefined(response.body)) {
    return new Uint8Array();
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  for await (const chunk of response.body) {
    receivedBytes += chunk.byteLength;

    if (receivedBytes > byteLimit) {
      throw createResponseLimitError(byteLimit);
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
};
