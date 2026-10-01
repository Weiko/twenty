import { createRequire } from 'node:module';

import { isFunction, isNonEmptyString, isString } from '@sniptt/guards';
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

type GenerateClientApi = {
  generateAppClient: (options: {
    appPath: string;
    schema: string;
    signal: AbortSignal;
  }) => Promise<unknown>;
};

type RunRequest = Extract<AppWorkerRequest, { type: 'run' }>;

type GenerateClientRequest = Extract<
  AppWorkerRequest,
  { type: 'generateClient' }
>;

type HeldSnapshot = {
  buildModule: BuildApi;
  buildId: string;
};

const PARENT_DISCONNECT_EXIT_MILLISECONDS = 5000;

const abortController = new AbortController();

let heldSnapshot: HeldSnapshot | undefined;

const isTypecheckApi = (value: unknown): value is TypecheckApi =>
  isPlainObject(value) && isFunction(value.typecheckApp);

const isBuildApi = (value: unknown): value is BuildApi =>
  isPlainObject(value) &&
  isFunction(value.buildAppSnapshot) &&
  isFunction(value.releaseAppSnapshot);

const isGenerateClientApi = (value: unknown): value is GenerateClientApi =>
  isPlainObject(value) && isFunction(value.generateAppClient);

const createMissingExportsError = ({
  buildEntryPath,
  exportNames,
  purpose,
}: {
  buildEntryPath: string;
  exportNames: string[];
  purpose: string;
}) =>
  new Error(
    `${buildEntryPath} must export ${exportNames.join(' and ')} to ${purpose}.`,
  );

const parseRequest = (message: unknown): AppWorkerRequest | undefined => {
  if (!isPlainObject(message)) {
    return undefined;
  }

  if (message.type === 'cancel' || message.type === 'release') {
    return { type: message.type };
  }

  if (
    message.type === 'readSourceIdentity' ||
    message.type === 'buildManifest' ||
    message.type === 'typecheckSource'
  ) {
    return isNonEmptyString(message.appPath)
      ? { type: message.type, appPath: message.appPath }
      : undefined;
  }

  if (message.type === 'bundleSnapshot') {
    return isNonEmptyString(message.appPath)
      ? {
          type: 'bundleSnapshot',
          collectWatchInputs: message.collectWatchInputs === true,
          appPath: message.appPath,
          holdSnapshot: message.holdSnapshot === true,
        }
      : undefined;
  }

  if (message.type === 'pull') {
    if (
      !isNonEmptyString(message.appPath) ||
      !isPlainObject(message.target) ||
      !isNonEmptyString(message.target.apiUrl) ||
      !isNonEmptyString(message.target.workspaceId) ||
      !isPlainObject(message.applicationExport) ||
      !isPlainObject(message.applicationExport.application) ||
      !isNonEmptyString(
        message.applicationExport.application.universalIdentifier,
      )
    ) {
      return undefined;
    }
    return {
      type: 'pull',
      appPath: message.appPath,
      target: {
        apiUrl: message.target.apiUrl,
        workspaceId: message.target.workspaceId,
      },
      applicationExport: message.applicationExport,
    };
  }

  if (message.type === 'generateSourceClient') {
    return isNonEmptyString(message.appPath) && isString(message.schema)
      ? {
          type: 'generateSourceClient',
          appPath: message.appPath,
          schema: message.schema,
        }
      : undefined;
  }

  if (message.type === 'generateClient') {
    if (
      !isNonEmptyString(message.appPath) ||
      !isNonEmptyString(message.buildEntryPath) ||
      !isString(message.schema)
    ) {
      return undefined;
    }

    return {
      type: 'generateClient',
      appPath: message.appPath,
      buildEntryPath: message.buildEntryPath,
      schema: message.schema,
    };
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
    holdSnapshot: message.holdSnapshot === true,
  };
};

const respond = (response: AppWorkerResponse) => {
  if (!process.connected) {
    process.exit(1);
  }

  process.send?.(response, undefined, {}, () => process.exit(0));
};

const releaseHeldSnapshot = async () => {
  if (!isDefined(heldSnapshot)) {
    return null;
  }

  const { buildModule, buildId } = heldSnapshot;

  heldSnapshot = undefined;

  return buildModule.releaseAppSnapshot({ buildId });
};

const exitAfterReleasing = () => {
  releaseHeldSnapshot().finally(() => process.exit(1));
};

const sendHeldResult = (response: AppWorkerResponse) => {
  if (!process.connected) {
    exitAfterReleasing();

    return;
  }

  process.send?.(response);
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
  holdSnapshot,
}: RunRequest): Promise<AppWorkerResponse> => {
  const buildModule: unknown = createRequire(buildEntryPath)(buildEntryPath);
  const signal = abortController.signal;

  if (operation === 'typecheck') {
    if (!isTypecheckApi(buildModule)) {
      throw createMissingExportsError({
        buildEntryPath,
        exportNames: ['typecheckApp'],
        purpose: 'typecheck the app',
      });
    }

    return {
      type: 'result',
      result: await buildModule.typecheckApp({ appPath, signal }),
      isSnapshotHeld: false,
    };
  }

  if (!isBuildApi(buildModule)) {
    throw createMissingExportsError({
      buildEntryPath,
      exportNames: ['buildAppSnapshot', 'releaseAppSnapshot'],
      purpose: 'build the app',
    });
  }

  return runSnapshotBuild({ buildModule, appPath, holdSnapshot });
};

const runSnapshotBuild = async ({
  buildModule,
  appPath,
  holdSnapshot,
}: {
  buildModule: BuildApi;
  appPath: string;
  holdSnapshot: boolean;
}): Promise<AppWorkerResponse> => {
  const signal = abortController.signal;
  const result = await buildModule.buildAppSnapshot({ appPath, signal });
  const buildId = readSuccessfulBuildId(result);

  if (!isDefined(buildId)) {
    return { type: 'result', result, isSnapshotHeld: false };
  }

  if (holdSnapshot) {
    heldSnapshot = { buildModule, buildId };

    return { type: 'result', result, isSnapshotHeld: true };
  }

  return {
    type: 'result',
    result,
    release: await buildModule.releaseAppSnapshot({ buildId }),
    isSnapshotHeld: false,
  };
};

const generateClient = async ({
  appPath,
  buildEntryPath,
  schema,
}: GenerateClientRequest): Promise<AppWorkerResponse> => {
  const buildModule: unknown = createRequire(buildEntryPath)(buildEntryPath);

  if (!isGenerateClientApi(buildModule)) {
    throw createMissingExportsError({
      buildEntryPath,
      exportNames: ['generateAppClient'],
      purpose: 'generate the app client',
    });
  }

  return {
    type: 'result',
    result: await buildModule.generateAppClient({
      appPath,
      schema,
      signal: abortController.signal,
    }),
    isSnapshotHeld: false,
  };
};

const toFailure = (error: unknown): AppWorkerResponse => ({
  type: 'failure',
  message: error instanceof Error ? error.message : String(error),
});

process.on('SIGINT', () => undefined);

process.on('disconnect', () => {
  abortController.abort();
  setTimeout(() => process.exit(1), PARENT_DISCONNECT_EXIT_MILLISECONDS);

  if (isDefined(heldSnapshot)) {
    exitAfterReleasing();
  }
});

process.on('message', (message: unknown) => {
  const request = parseRequest(message);

  if (!isDefined(request)) {
    respond({
      type: 'failure',
      message: 'The app worker received a request it cannot read.',
    });

    return;
  }

  if (request.type === 'cancel') {
    abortController.abort();

    return;
  }

  if (request.type === 'release') {
    releaseHeldSnapshot().then(
      (release) => respond({ type: 'released', release }),
      (error: unknown) => respond(toFailure(error)),
    );

    return;
  }

  if (request.type === 'pull') {
    import('@/app/worker/pull-source')
      .then(async ({ pullSource }) => {
        const result = await pullSource({
          ...request,
          signal: abortController.signal,
        });
        respond({ type: 'result', result, isSnapshotHeld: false });
      })
      .catch((error: unknown) => respond(toFailure(error)));
    return;
  }

  if (request.type === 'bundleSnapshot') {
    import('@/app/worker/build-source-snapshot')
      .then(async ({ buildSourceSnapshot, releaseSourceSnapshot }) => {
        const run = () =>
          runSnapshotBuild({
            buildModule: {
              buildAppSnapshot: buildSourceSnapshot,
              releaseAppSnapshot: releaseSourceSnapshot,
            },
            appPath: request.appPath,
            holdSnapshot: request.holdSnapshot,
          });

        if (!request.collectWatchInputs) {
          return run();
        }

        const { collectWatchInputs } =
          await import('@/app/dev/collect-watch-inputs');
        const { recordTypecheckConfigInputs } =
          await import('@/app/dev/record-typecheck-config-inputs');
        const collected = await collectWatchInputs(async () => {
          await recordTypecheckConfigInputs(request.appPath);

          return run();
        });

        return { ...collected.result, watchInputs: collected.watchInputs };
      })
      .then(
        (response) =>
          response.type === 'result' && response.isSnapshotHeld
            ? sendHeldResult(response)
            : respond(response),
        (error: unknown) => respond(toFailure(error)),
      );

    return;
  }

  if (request.type === 'typecheckSource') {
    import('@/app/typecheck/typecheck-application')
      .then(async ({ typecheckApplication }) => {
        const result = await typecheckApplication({
          appPath: request.appPath,
          signal: abortController.signal,
        });

        respond({ type: 'result', result, isSnapshotHeld: false });
      })
      .catch((error: unknown) => respond(toFailure(error)));

    return;
  }

  if (request.type === 'buildManifest') {
    import('@/app/worker/build-source-manifest')
      .then(async ({ buildSourceManifest }) => {
        const result = await buildSourceManifest({
          appPath: request.appPath,
          signal: abortController.signal,
        });

        respond({ type: 'result', result, isSnapshotHeld: false });
      })
      .catch((error: unknown) => respond(toFailure(error)));

    return;
  }

  if (request.type === 'readSourceIdentity') {
    import('@/app/worker/read-source-identity')
      .then(async ({ readSourceIdentity }) => {
        const result = await readSourceIdentity({
          appPath: request.appPath,
          signal: abortController.signal,
        });

        respond({ type: 'result', result, isSnapshotHeld: false });
      })
      .catch((error: unknown) => respond(toFailure(error)));

    return;
  }

  if (request.type === 'generateSourceClient') {
    import('@/app/client/generate-application-client')
      .then(async ({ generateApplicationClient }) => {
        const result = await generateApplicationClient({
          appPath: request.appPath,
          schema: request.schema,
          signal: abortController.signal,
        });

        respond({ type: 'result', result, isSnapshotHeld: false });
      })
      .catch((error: unknown) => respond(toFailure(error)));

    return;
  }

  if (request.type === 'generateClient') {
    generateClient(request).then(respond, (error: unknown) =>
      respond(toFailure(error)),
    );

    return;
  }

  runOperation(request).then(
    (response) =>
      response.type === 'result' && response.isSnapshotHeld
        ? sendHeldResult(response)
        : respond(response),
    (error: unknown) => respond(toFailure(error)),
  );
});
