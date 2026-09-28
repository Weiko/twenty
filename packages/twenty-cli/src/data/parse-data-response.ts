import { isNonEmptyString } from '@sniptt/guards';

import { type DataPage } from '@/data/types/data-page.type';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';
import { isJsonObject } from '@/utils/is-json-object';

const invalidResponse = () =>
  new CliError({
    code: 'INVALID_RESPONSE',
    message: 'The server returned an invalid record response.',
  });

const isCursor = (value: unknown): value is string | null =>
  value === null || isNonEmptyString(value);

export const parseDataPage = (
  body: unknown,
  objectName: string,
  limit: number,
): DataPage => {
  if (!isJsonObject(body) || !isJsonObject(body.data)) {
    throw invalidResponse();
  }

  const records = body.data[objectName];
  const pageInfo = body.pageInfo;
  const totalCount = body.totalCount;

  if (
    !Array.isArray(records) ||
    records.length > limit ||
    !records.every(isJsonObject) ||
    !isJsonObject(pageInfo) ||
    typeof pageInfo.hasNextPage !== 'boolean' ||
    (pageInfo.hasPreviousPage !== undefined &&
      typeof pageInfo.hasPreviousPage !== 'boolean') ||
    !isCursor(pageInfo.startCursor) ||
    !isCursor(pageInfo.endCursor) ||
    (records.length > 0 &&
      (!isNonEmptyString(pageInfo.startCursor) ||
        !isNonEmptyString(pageInfo.endCursor))) ||
    (pageInfo.hasNextPage &&
      (records.length === 0 || !isNonEmptyString(pageInfo.endCursor))) ||
    typeof totalCount !== 'number' ||
    !Number.isSafeInteger(totalCount) ||
    totalCount < 0
  ) {
    throw invalidResponse();
  }

  return {
    records,
    pageInfo: {
      hasNextPage: pageInfo.hasNextPage,
      ...(typeof pageInfo.hasPreviousPage === 'boolean'
        ? { hasPreviousPage: pageInfo.hasPreviousPage }
        : {}),
      startCursor: pageInfo.startCursor,
      endCursor: pageInfo.endCursor,
    },
    totalCount,
  };
};

export const parseDataRecord = (body: unknown, objectName: string) => {
  if (!isJsonObject(body) || !isJsonObject(body.data)) {
    throw invalidResponse();
  }

  const record = body.data[objectName];

  if (record === null) {
    throw new CliError({
      code: 'NOT_FOUND',
      exitCode: EXIT_CODE.NOT_FOUND,
      message: `No ${objectName} record has that id.`,
    });
  }

  if (!isJsonObject(record)) {
    throw invalidResponse();
  }

  return record;
};
