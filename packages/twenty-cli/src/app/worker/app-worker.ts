import { createRequire } from 'node:module';

import { isFunction, isNonEmptyString } from '@sniptt/guards';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

import type {
  AppWorkerRequest,
  AppWorkerResponse,
} from '@/app/types/app-worker-message.type';

type TypecheckApi = {
  typecheckApp: (options: {
    appPath: string;
    signal: AbortSignal;
  }) => Promise<unknown>;
};

type BuildApi = {
  buildAppSnapshot: (options: {
    appPath: string;
    signal: AbortSignal;
  }) => Promise<unknown>;
  releaseAppSnapshot: (options: { buildId: string }) => Promise<unknown>;
};

type RunRequest = Extract<AppWorkerRequest, { type: 'run' }>;

const PARENT_DISCONNECT_EXIT_MILLISECONDS = 5000;

const abortController = new AbortController();

const isTypecheckApi = (value: unknown): value is TypecheckApi =>
  isPlainObject(value) && isFunction(value.typecheckApp);

const isBuildApi = (value: unknown): value is BuildApi =>
  isPlainObject(value) &&
  isFunction(value.buildAppSnapshot) &&
  isFunction(value.releaseAppSnapshot);

const createMissingExportsError = ({
  buildEntryPath,
  operation,
  exportNames,
}: {
  buildEntryPath: string;
  operation: RunRequest['operation'];
  exportNames: string[];
}) =>
  new Error(
    `${buildEntryPath} must export ${exportNames.join(' and ')} to ${operation} the app.`,
  );

const parseRequest = (message: unknown): AppWorkerRequest | undefined => {
  if (!isPlainObject(message)) {
    return undefined;
  }

  if (message.type === 'cancel') {
    return { type: 'cancel' };
  }

  if (
    message.type !== 'run' ||
    (message.operation !== 'build' && message.operation !== 'typecheck') ||
    !isNonEmptyString(message.appPath) ||
    !isNonEmptyString(message.buildEntryPath)
  ) {
    return undefined;
  }

  return {
    type: 'run',
    operation: message.operation,
    appPath: message.appPath,
    buildEntryPath: message.buildEntryPath,
  };
};

const respond = (response: AppWorkerResponse) => {
  if (!process.connected) {
    process.exit(1);
  }

  process.send?.(response, undefined, {}, () => process.exit(0));
};

const readSuccessfulBuildId = (result: unknown) => {
  if (
    !isPlainObject(result) ||
    result.success !== true ||
    !isPlainObject(result.data)
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
  const buildModule: unknown = createRequire(buildEntryPath)(buildEntryPath);
  const signal = abortController.signal;

  if (operation === 'typecheck') {
    if (!isTypecheckApi(buildModule)) {
      throw createMissingExportsError({
        buildEntryPath,
        operation,
        exportNames: ['typecheckApp'],
      });
    }

    return {
      type: 'result',
      result: await buildModule.typecheckApp({ appPath, signal }),
    };
  }

  if (!isBuildApi(buildModule)) {
    throw createMissingExportsError({
      buildEntryPath,
      operation,
      exportNames: ['buildAppSnapshot', 'releaseAppSnapshot'],
    });
  }

  const result = await buildModule.buildAppSnapshot({ appPath, signal });
  const buildId = readSuccessfulBuildId(result);

  return isDefined(buildId)
    ? {
        type: 'result',
        result,
        release: await buildModule.releaseAppSnapshot({ buildId }),
      }
    : { type: 'result', result };
};

process.on('SIGINT', () => undefined);

process.on('disconnect', () => {
  abortController.abort();
  setTimeout(() => process.exit(1), PARENT_DISCONNECT_EXIT_MILLISECONDS);
});

process.on('message', (message: unknown) => {
  const request = parseRequest(message);

  if (!isDefined(request)) {
    respond({
      type: 'failure',
      message: 'The build worker received a request it cannot read.',
    });

    return;
  }

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
