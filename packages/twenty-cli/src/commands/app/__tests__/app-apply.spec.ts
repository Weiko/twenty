import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isArray, isString } from '@sniptt/guards';
import { type ServerResponse } from 'node:http';
import { isDefined, isPlainObject } from 'twenty-shared/utils';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { createStandardInputStub } from '@/__tests__/utils/create-standard-input-stub';
import {
  parseSingleJsonLine,
  runCliForTest,
} from '@/__tests__/utils/run-cli-for-test';
import {
  type RecordedRequest,
  sendJson,
  startTestServer,
} from '@/__tests__/utils/start-test-server';

vi.mock('@/app/get-app-worker-launch', () => ({
  getAppWorkerLaunch: () => ({
    modulePath: fileURLToPath(
      new URL('../../../app/worker/app-worker.ts', import.meta.url),
    ),
    execArgv: [
      '--disable-warning=ExperimentalWarning',
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
    ],
  }),
}));

const APPLICATION = {
  universalIdentifier: '6a0c9d8e-8f5f-4c43-9b8e-0e1f2a3b4c5d',
  name: 'apply-app',
  displayName: 'Apply App',
};
const MANIFEST = { application: APPLICATION };
const FILES = [
  {
    path: 'logic-functions/hello.mjs',
    role: 'built-logic-function',
    content: 'export default () => "hello";',
  },
  { path: 'public/logo.svg', role: 'public-asset', content: '<svg></svg>' },
];
const CREATE_ACTION = {
  type: 'create',
  metadataName: 'logicFunction',
  flatEntity: { name: 'hello' },
};
const OBJECT_DELETION = {
  type: 'delete',
  metadataName: 'objectMetadata',
  universalIdentifier: 'object-id',
  flatEntity: { nameSingular: 'invoice' },
};

type ServerState = {
  isRegistered: boolean;
  previewActions: unknown[];
  installError?: string;
  completeError?: string;
  syncError?: string;
  syncResponseOverride?: unknown;
  failingUploadFileId?: string;
  hasInvalidFirstUploadUrl: boolean;
  heldUploadFileId?: string;
  wasSnapshotPresentDuringHeldUpload?: boolean;
  isSyncHeld: boolean;
  heldSyncResponse?: ServerResponse;
  wasSnapshotPresentAtSync?: boolean;
  snapshotPath: string;
};

const state: ServerState = {
  isRegistered: true,
  previewActions: [CREATE_ACTION],
  hasInvalidFirstUploadUrl: false,
  isSyncHeld: false,
  snapshotPath: '',
};

const graphqlError = (code: string, subCode?: string) => ({
  data: null,
  errors: [
    {
      message: 'The server refused the request.',
      path: ['syncApplication'],
      extensions: { code, subCode },
    },
  ],
});

const readGraphqlRequest = (request: RecordedRequest) => {
  const body: unknown = JSON.parse(request.body);

  return {
    query: isPlainObject(body) && isString(body.query) ? body.query : '',
    variables:
      isPlainObject(body) && isPlainObject(body.variables)
        ? body.variables
        : {},
  };
};

const getOperation = (request: RecordedRequest) => {
  if (request.method === 'PUT') {
    return 'put';
  }

  const { query } = readGraphqlRequest(request);

  if (query.includes('dryRun: true')) {
    return 'preview';
  }

  return (
    [
      ['createApplicationRegistration', 'registration'],
      ['createDevelopmentApplication', 'installation'],
      ['createApplicationFileUploads', 'upload-targets'],
      ['completeApplicationFileUploads', 'upload-complete'],
      ['syncApplication', 'sync'],
    ].find(([field]) => query.includes(field))?.[1] ?? 'unknown'
  );
};

const readUniversalIdentifier = (variables: Record<string, unknown>) => {
  const manifest = isPlainObject(variables.manifest)
    ? variables.manifest
    : undefined;
  const application = isPlainObject(manifest?.application)
    ? manifest.application
    : undefined;
  const input = isPlainObject(variables.input) ? variables.input : undefined;

  return [
    application?.universalIdentifier,
    input?.universalIdentifier,
    variables.universalIdentifier,
  ].find(isString);
};

const syncResponse = (variables: Record<string, unknown>) => ({
  data: {
    syncApplication: {
      applicationUniversalIdentifier: readUniversalIdentifier(variables),
      actions: state.previewActions,
    },
  },
});

const server = await startTestServer((request, response) => {
  const operation = getOperation(request);

  if (operation === 'put') {
    if (request.path.endsWith(`/${state.heldUploadFileId}`)) {
      setTimeout(() => {
        state.wasSnapshotPresentDuringHeldUpload = existsSync(
          state.snapshotPath,
        );
        sendJson(response, 200, {});
      }, 300);

      return;
    }

    return sendJson(
      response,
      request.path.endsWith(`/${state.failingUploadFileId}`) ? 500 : 200,
      {},
    );
  }

  const { variables } = readGraphqlRequest(request);

  if (operation === 'preview') {
    return sendJson(
      response,
      200,
      state.isRegistered
        ? syncResponse(variables)
        : graphqlError('NOT_FOUND', 'APPLICATION_NOT_FOUND'),
    );
  }

  if (operation === 'registration') {
    state.isRegistered = true;

    return sendJson(response, 200, {
      data: {
        createApplicationRegistration: {
          applicationRegistration: {
            id: 'registration-id',
            universalIdentifier: readUniversalIdentifier(variables),
          },
        },
      },
    });
  }

  if (operation === 'installation') {
    return sendJson(
      response,
      200,
      isDefined(state.installError)
        ? graphqlError(state.installError)
        : {
            data: {
              createDevelopmentApplication: {
                id: 'application-id',
                universalIdentifier: readUniversalIdentifier(variables),
              },
            },
          },
    );
  }

  if (operation === 'upload-targets') {
    const files = isArray(variables.files) ? variables.files : [];

    return sendJson(response, 200, {
      data: {
        createApplicationFileUploads: {
          targets: files.filter(isPlainObject).map((file, index) => ({
            fileId: `file-${index}`,
            filePath: file.filePath,
            uploadUrl:
              state.hasInvalidFirstUploadUrl && index === 0
                ? 'ftp://storage.example.com/upload'
                : `${server.url}/upload/file-${index}`,
            contentType: 'application/octet-stream',
          })),
          errors: [],
        },
      },
    });
  }

  if (operation === 'upload-complete') {
    return sendJson(
      response,
      200,
      isDefined(state.completeError)
        ? graphqlError(state.completeError)
        : { data: { completeApplicationFileUploads: { errors: [] } } },
    );
  }

  if (operation === 'sync') {
    state.wasSnapshotPresentAtSync = existsSync(state.snapshotPath);

    if (isDefined(state.syncError)) {
      return sendJson(response, 200, graphqlError(state.syncError));
    }

    if (isDefined(state.syncResponseOverride)) {
      return sendJson(response, 200, state.syncResponseOverride);
    }

    if (state.isSyncHeld) {
      state.heldSyncResponse = response;

      return;
    }

    return sendJson(response, 200, syncResponse(variables));
  }

  return sendJson(response, 400, { errors: [{ message: 'Unexpected' }] });
});

describe('app apply', () => {
  let appPath: string;
  let sdkPath: string;

  const run = (...args: string[]) =>
    runCliForTest(['app', 'apply', '--path', appPath, ...args]);
  const runJson = async (...args: string[]) => {
    const result = await run(...args, '--json');

    return { ...result, envelope: parseSingleJsonLine(result.stdout) };
  };
  const operations = () => server.requests.map(getOperation);
  const readReleasedBuildId = () =>
    readFile(join(sdkPath, 'released.txt'), 'utf8');

  const writeSdk = async ({ corruptPath }: { corruptPath?: string } = {}) => {
    await writeFile(
      join(sdkPath, 'build.cjs'),
      `
      const fs = require('node:fs');
      const path = require('node:path');
      const { createHash } = require('node:crypto');
      const FILES = ${JSON.stringify(FILES)};
      const CORRUPT_PATH = ${JSON.stringify(corruptPath ?? null)};
      const sha256 = (content) => createHash('sha256').update(content).digest('hex');
      let snapshotDirectory;
      exports.buildAppSnapshot = async ({ appPath }) => {
        snapshotDirectory = path.join(appPath, '.twenty', 'snapshots', 'build-test');
        const filesDirectory = path.join(snapshotDirectory, 'files');
        const files = FILES.map((file) => {
          const absolutePath = path.join(filesDirectory, file.path);
          fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
          fs.writeFileSync(absolutePath, file.content);
          return {
            path: file.path,
            role: file.role,
            sourcePath: 'src/' + path.basename(file.path),
            size: Buffer.byteLength(file.content),
            sha256: sha256(file.path === CORRUPT_PATH ? 'changed' : file.content),
          };
        });
        return {
          success: true,
          data: {
            buildId: 'build-id',
            directory: filesDirectory,
            contentHash: 'a'.repeat(64),
            application: ${JSON.stringify(APPLICATION)},
            manifestFormat: 'twenty-application',
            manifest: ${JSON.stringify(MANIFEST)},
            files,
          },
          diagnostics: [],
        };
      };
      exports.releaseAppSnapshot = async ({ buildId }) => {
        fs.rmSync(snapshotDirectory, { recursive: true, force: true });
        fs.writeFileSync(path.join(__dirname, 'released.txt'), buildId);
        return { success: true, data: null, diagnostics: [] };
      };
    `,
    );
  };

  beforeEach(async () => {
    appPath = await mkdtemp(join(tmpdir(), 'twenty-cli-apply-'));
    sdkPath = join(appPath, 'node_modules', 'twenty-sdk');
    await mkdir(sdkPath, { recursive: true });
    await writeFile(
      join(appPath, 'package.json'),
      JSON.stringify({
        name: 'apply-app',
        devDependencies: { 'twenty-sdk': '9.9.9' },
      }),
    );
    await writeFile(
      join(sdkPath, 'package.json'),
      JSON.stringify({
        name: 'twenty-sdk',
        version: '9.9.9',
        exports: {
          './build': './build.cjs',
          './build/descriptor.json': './descriptor.json',
        },
      }),
    );
    await writeFile(
      join(sdkPath, 'descriptor.json'),
      JSON.stringify({
        protocolVersion: 1,
        requiredNode: '24',
        capabilities: ['build', 'releaseSnapshot'],
      }),
    );
    await writeSdk();
    vi.stubEnv('TWENTY_API_URL', server.url);
    vi.stubEnv('TWENTY_API_KEY', 'apply-test-key');
    vi.stubEnv('TWENTY_REMOTE', '');
    vi.stubEnv('CI', '');
    Object.assign(state, {
      isRegistered: true,
      previewActions: [CREATE_ACTION],
      installError: undefined,
      completeError: undefined,
      syncError: undefined,
      syncResponseOverride: undefined,
      failingUploadFileId: undefined,
      hasInvalidFirstUploadUrl: false,
      heldUploadFileId: undefined,
      wasSnapshotPresentDuringHeldUpload: undefined,
      isSyncHeld: false,
      heldSyncResponse: undefined,
      wasSnapshotPresentAtSync: undefined,
      snapshotPath: join(appPath, '.twenty', 'snapshots', 'build-test'),
    });
    server.requests.length = 0;
  });

  afterEach(() => {
    state.heldSyncResponse?.end();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(() => server.close());

  it.each([true, false])(
    'previews, installs, uploads without credentials, then syncs with deletion inference %s',
    async (inferDeletion) => {
      const { envelope, exitCode } = await runJson(
        ...(inferDeletion ? [] : ['--no-delete']),
      );

      expect(exitCode).toBe(0);
      expect(envelope.data).toMatchObject({
        application: APPLICATION,
        inferDeletionFromMissingEntities: inferDeletion,
        registrationCreated: false,
        completedPhases: ['build', 'preview', 'installation', 'upload', 'sync'],
        actions: [CREATE_ACTION],
        summary: { create: 1, update: 0, delete: 0, destructive: 0 },
        upload: { fileCount: 2, byteCount: 40 },
        clientGeneration: 'skipped',
      });
      expect(envelope.warnings).toEqual([
        expect.objectContaining({ code: 'CLIENT_NOT_GENERATED' }),
      ]);
      expect(operations()).toEqual([
        'preview',
        'installation',
        'upload-targets',
        'put',
        'put',
        'upload-complete',
        'sync',
      ]);

      const [preview, , uploadTargets] = server.requests;
      const sync = server.requests.at(-1);

      expect(readGraphqlRequest(preview).variables).toMatchObject({
        manifest: MANIFEST,
        inferDeletionFromMissingEntities: inferDeletion,
      });
      expect(isDefined(sync) && readGraphqlRequest(sync)).toMatchObject({
        query: expect.not.stringContaining('dryRun'),
        variables: {
          manifest: MANIFEST,
          inferDeletionFromMissingEntities: inferDeletion,
        },
      });
      expect(readGraphqlRequest(uploadTargets).variables).toMatchObject({
        applicationUniversalIdentifier: APPLICATION.universalIdentifier,
        files: [
          {
            fileFolder: 'BuiltLogicFunction',
            filePath: 'logic-functions/hello.mjs',
            size: 29,
          },
          { fileFolder: 'PublicAsset', filePath: 'public/logo.svg', size: 11 },
        ],
      });

      const puts = server.requests.filter(
        (request) => request.method === 'PUT',
      );

      expect(puts.map((request) => request.body).sort()).toEqual(
        FILES.map((file) => file.content).sort(),
      );
      expect(
        puts.every((request) => !isDefined(request.headers.authorization)),
      ).toBe(true);
      expect(state.wasSnapshotPresentAtSync).toBe(true);
      expect(await readReleasedBuildId()).toBe('build-id');
      expect(existsSync(state.snapshotPath)).toBe(false);
    },
  );

  it('refuses to register an unknown app without --create', async () => {
    state.isRegistered = false;

    const { envelope, exitCode } = await runJson();

    expect(exitCode).toBe(2);
    expect(envelope.error).toMatchObject({
      code: 'CREATE_REQUIRED',
      hint: expect.stringContaining('--create'),
      details: {
        phase: 'confirmation',
        outcome: 'not-started',
        completedPhases: ['build'],
      },
    });
    expect(operations()).toEqual(['preview']);
    expect(await readReleasedBuildId()).toBe('build-id');
  });

  it('registers, installs and previews an unknown app with --create before uploading', async () => {
    state.isRegistered = false;

    const { envelope, exitCode } = await runJson('--create');

    expect(exitCode).toBe(0);
    expect(envelope.data).toMatchObject({
      registrationCreated: true,
      completedPhases: [
        'build',
        'registration',
        'installation',
        'preview',
        'upload',
        'sync',
      ],
    });
    expect(operations()).toEqual([
      'preview',
      'registration',
      'installation',
      'preview',
      'upload-targets',
      'put',
      'put',
      'upload-complete',
      'sync',
    ]);
    expect(server.requests[1].body).not.toContain('clientSecret');
  });

  it('keeps a completed registration in the report when a later step fails', async () => {
    state.isRegistered = false;
    state.installError = 'FORBIDDEN';

    const { envelope, exitCode } = await runJson('--create');

    expect(exitCode).toBe(3);
    expect(envelope.error).toMatchObject({
      code: 'PERMISSION_DENIED',
      details: {
        phase: 'installation',
        outcome: 'not-started',
        completedPhases: ['build', 'registration'],
      },
    });
    expect(operations()).toEqual(['preview', 'registration', 'installation']);
  });

  it('requires --yes before deleting objects or fields in automation', async () => {
    state.previewActions = [CREATE_ACTION, OBJECT_DELETION];

    const refused = await runJson();

    expect(refused.exitCode).toBe(2);
    expect(refused.envelope.error).toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
      hint: expect.stringContaining('--yes'),
      details: { phase: 'confirmation', completedPhases: ['build', 'preview'] },
    });
    expect(operations()).toEqual(['preview']);

    server.requests.length = 0;

    const approved = await runJson('--yes');

    expect(approved.exitCode).toBe(0);
    expect(approved.envelope.data.summary).toMatchObject({
      delete: 1,
      destructive: 1,
    });
    expect(operations().at(-1)).toBe('sync');
  });

  it.each([
    ['y\n', 0, 'sync'],
    ['n\n', 2, 'preview'],
  ])(
    'asks before deleting objects in an interactive terminal (answer %j)',
    async (answer, expectedExitCode, lastOperation) => {
      state.previewActions = [OBJECT_DELETION];
      vi.spyOn(process, 'stdin', 'get').mockReturnValue(
        createStandardInputStub({ content: answer, isTerminal: true }),
      );

      const { exitCode, stderr } = await run();

      expect(exitCode).toBe(expectedExitCode);
      expect(stderr).toContain('permanently delete stored data');
      expect(operations().at(-1)).toBe(lastOperation);
    },
  );

  it('reports a partial upload and never syncs', async () => {
    state.failingUploadFileId = 'file-1';

    const { envelope, exitCode } = await runJson();

    expect(exitCode).toBe(1);
    expect(envelope.error).toMatchObject({
      code: 'UPLOAD_FAILED',
      details: {
        phase: 'upload',
        outcome: 'partial',
        completedPhases: ['build', 'preview', 'installation'],
        failures: [
          { path: 'public/logo.svg', message: 'File storage answered 500.' },
        ],
      },
    });
    expect(operations()).not.toContain('sync');
    expect(await readReleasedBuildId()).toBe('build-id');
  });

  it('waits for uploads in flight before releasing the snapshot after an upload error', async () => {
    state.hasInvalidFirstUploadUrl = true;
    state.heldUploadFileId = 'file-1';

    const { envelope, exitCode } = await runJson();

    expect(exitCode).toBe(1);
    expect(envelope.error).toMatchObject({
      code: 'INVALID_RESPONSE',
      details: {
        phase: 'upload',
        outcome: 'unknown',
        completedPhases: ['build', 'preview', 'installation'],
      },
    });
    expect(state.wasSnapshotPresentDuringHeldUpload).toBe(true);
    expect(operations()).not.toContain('upload-complete');
    expect(operations()).not.toContain('sync');
    expect(await readReleasedBuildId()).toBe('build-id');
  });

  it('does not claim an untouched workspace once upload targets exist', async () => {
    state.completeError = 'FORBIDDEN';

    const { envelope, exitCode } = await runJson();

    expect(exitCode).toBe(3);
    expect(envelope.error).toMatchObject({
      code: 'PERMISSION_DENIED',
      details: { phase: 'upload', outcome: 'unknown' },
    });
    expect(operations()).not.toContain('sync');
  });

  it('refuses a snapshot file that changed after the build before uploading', async () => {
    await writeSdk({ corruptPath: 'public/logo.svg' });

    const { envelope, exitCode } = await runJson();

    expect(exitCode).toBe(1);
    expect(envelope.error).toMatchObject({
      code: 'SNAPSHOT_INVALID',
      details: { phase: 'upload', outcome: 'not-started' },
    });
    expect(operations()).toEqual(['preview', 'installation']);
  });

  it('reports an unknown outcome when the sync fails', async () => {
    state.syncError = 'BAD_USER_INPUT';

    const { envelope, exitCode } = await runJson();

    expect(exitCode).toBe(1);
    expect(envelope.error).toMatchObject({
      code: 'GRAPHQL_ERROR',
      hint: expect.stringContaining('twenty app plan'),
      details: {
        phase: 'sync',
        outcome: 'unknown',
        completedPhases: ['build', 'preview', 'installation', 'upload'],
      },
    });
    expect(await readReleasedBuildId()).toBe('build-id');
  });

  it.each([
    ['no result', { data: null }],
    ['an empty result', { data: {} }],
    [
      'the wrong application',
      {
        data: {
          syncApplication: {
            applicationUniversalIdentifier: 'another-app',
            actions: [],
          },
        },
      },
    ],
  ])(
    'never reports an applied app when the sync answers with %s',
    async (_description, response) => {
      state.syncResponseOverride = response;

      const { envelope, exitCode, stdout } = await runJson();

      expect(exitCode).toBe(1);
      expect(envelope.error).toMatchObject({
        code: 'INVALID_RESPONSE',
        details: { phase: 'sync', outcome: 'unknown' },
      });
      expect(stdout).not.toContain('Applied');
    },
  );

  it('keeps variable values from a failed sync out of the error', async () => {
    state.syncResponseOverride = {
      data: {
        syncApplication: {
          applicationUniversalIdentifier: APPLICATION.universalIdentifier,
          actions: [
            {
              type: 'create',
              metadataName: 'applicationVariable',
              flatEntity: { name: 'API_TOKEN', value: 'super-secret' },
            },
          ],
        },
      },
      errors: [
        { message: 'Partial failure.', extensions: { code: 'BAD_USER_INPUT' } },
      ],
    };

    const { envelope, exitCode, stdout } = await runJson();

    expect(exitCode).toBe(1);
    expect(envelope.error).toMatchObject({
      code: 'GRAPHQL_ERROR',
      details: { phase: 'sync', outcome: 'unknown', data: null },
    });
    expect(stdout).not.toContain('super-secret');
  });

  it('exits with 130 and an unknown sync outcome when cancelled during the sync', async () => {
    state.isSyncHeld = true;

    const pending = runJson();

    await vi.waitFor(() => expect(operations()).toContain('sync'), {
      timeout: 10_000,
    });
    process.emit('SIGINT');

    const { envelope, exitCode } = await pending;

    expect(exitCode).toBe(130);
    expect(envelope.error).toMatchObject({
      code: 'CANCELLED',
      details: { phase: 'sync', outcome: 'unknown' },
    });
    expect(await readReleasedBuildId()).toBe('build-id');
  });

  it('prints the preview on stderr and a summary on stdout', async () => {
    const { stdout, stderr, exitCode } = await run();

    expect(exitCode).toBe(0);
    expect(stderr).toContain('1 to add, 0 to change, 0 to delete.');
    expect(stderr).toContain('typed API client was not regenerated');
    expect(stdout).toContain(`Applied Apply App to ${server.url}`);
    expect(stdout).toContain('2 files uploaded (40 B)');
  });

  it('lists the command as a write with its permissions', async () => {
    const { stdout } = await runCliForTest(['commands', '--json']);
    const commands: unknown = parseSingleJsonLine(stdout).data.commands;

    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app apply',
          writes: true,
          needsProject: true,
          needsTarget: true,
          requiredPermissions: ['APPLICATIONS', 'UPLOAD_FILE'],
        }),
      ]),
    );
  });
});
