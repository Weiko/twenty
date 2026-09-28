import { createRequire } from 'node:module';

import { isNonEmptyString, isObject } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import type {
  AppWorkerRequest,
  AppWorkerResponse,
} from '@/app/types/app-worker-message.type';

type BuildApi = {
  buildAppSnapshot: (options: {
    appPath: string;
    signal: AbortSignal;
  }) => Promise<unknown>;
  typecheckApp: (options: {
    appPath: string;
    signal: AbortSignal;
  }) => Promise<unknown>;
  releaseAppSnapshot: (options: { buildId: string }) => Promise<unknown>;
};

type RunRequest = Extract<AppWorkerRequest, { type: 'run' }>;

const PARENT_DISCONNECT_EXIT_MILLISECONDS = 5000;

const abortController = new AbortController();

const respond = (response: AppWorkerResponse) => {
  if (!process.connected) {
    process.exit(1);
  }

  process.send?.(response, undefined, {}, () => process.exit(0));
};

const readSuccessfulBuildId = (result: unknown) => {
  if (
    !isObject(result) ||
    !('success' in result) ||
    result.success !== true ||
    !('data' in result) ||
    !isObject(result.data) ||
    !('buildId' in result.data)
  ) {
    return undefined;
  }

  return isNonEmptyString(result.data.buildId)
    ? result.data.buildId
    : undefined;
};

const runOperation = async ({
  operation,
  appPath,
  buildEntryPath,
}: RunRequest): Promise<AppWorkerResponse> => {
  const buildApi = createRequire(buildEntryPath)(buildEntryPath) as BuildApi;
  const signal = abortController.signal;

  if (operation === 'typecheck') {
    return {
      type: 'result',
      result: await buildApi.typecheckApp({ appPath, signal }),
    };
  }

  const result = await buildApi.buildAppSnapshot({ appPath, signal });
  const buildId = readSuccessfulBuildId(result);

  return isDefined(buildId)
    ? {
        type: 'result',
        result,
        release: await buildApi.releaseAppSnapshot({ buildId }),
      }
    : { type: 'result', result };
};

process.on('SIGINT', () => undefined);

process.on('disconnect', () => {
  abortController.abort();
  setTimeout(() => process.exit(1), PARENT_DISCONNECT_EXIT_MILLISECONDS);
});

process.on('message', (request: AppWorkerRequest) => {
  if (request.type === 'cancel') {
    abortController.abort();

    return;
  }

  runOperation(request).then(respond, (error: unknown) =>
    respond({
      type: 'failure',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
});
