import { existsSync } from 'node:fs';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isArray, isString } from '@sniptt/guards';
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

import {
  parseSingleJsonLine,
  runCliForTest,
} from '@/__tests__/utils/run-cli-for-test';
import { sendJson, startTestServer } from '@/__tests__/utils/start-test-server';

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

const REPOSITORY_ROOT = fileURLToPath(
  new URL('../../../../../../', import.meta.url),
);

const APP_PATH = join(
  REPOSITORY_ROOT,
  'packages/twenty-apps/fixtures/minimal-app',
);

const SNAPSHOTS_PATH = join(APP_PATH, '.twenty', 'snapshots');

const listSnapshots = async () =>
  existsSync(SNAPSHOTS_PATH) ? await readdir(SNAPSHOTS_PATH) : [];

const readGraphqlBody = (body: string) => {
  const parsed: unknown = JSON.parse(body);

  return {
    query: isPlainObject(parsed) && isString(parsed.query) ? parsed.query : '',
    variables:
      isPlainObject(parsed) && isPlainObject(parsed.variables)
        ? parsed.variables
        : {},
  };
};

const readManifestIdentifier = (variables: Record<string, unknown>) => {
  const manifest = isPlainObject(variables.manifest)
    ? variables.manifest
    : undefined;

  return isPlainObject(manifest?.application)
    ? manifest.application.universalIdentifier
    : undefined;
};

let syncedManifest: unknown;

const server = await startTestServer((request, response) => {
  if (request.method === 'PUT') {
    return sendJson(response, 200, {});
  }

  const { query, variables } = readGraphqlBody(request.body);

  if (query.includes('syncApplication')) {
    if (!query.includes('dryRun: true')) {
      syncedManifest = variables.manifest;
    }
    return sendJson(response, 200, {
      data: {
        syncApplication: {
          applicationUniversalIdentifier: readManifestIdentifier(variables),
          actions: [],
        },
      },
    });
  }

  if (query.includes('createDevelopmentApplication')) {
    return sendJson(response, 200, {
      data: {
        createDevelopmentApplication: {
          id: 'application-id',
          universalIdentifier: variables.universalIdentifier,
        },
      },
    });
  }

  if (query.includes('createApplicationFileUploads')) {
    const files = isArray(variables.files) ? variables.files : [];

    return sendJson(response, 200, {
      data: {
        createApplicationFileUploads: {
          targets: files.filter(isPlainObject).map((file, index) => ({
            fileId: `file-${index}`,
            filePath: file.filePath,
            uploadUrl: `${server.url}/upload/file-${index}`,
            contentType: 'application/octet-stream',
          })),
          errors: [],
        },
      },
    });
  }

  if (query.includes('completeApplicationFileUploads')) {
    return sendJson(response, 200, {
      data: { completeApplicationFileUploads: { errors: [] } },
    });
  }

  if (query.includes('currentWorkspace')) {
    return sendJson(response, 200, {
      data: {
        currentWorkspace: { id: '48eb6ca1-dbd6-492e-8b53-5785a266c454' },
      },
    });
  }

  if (query.includes('exportApplication')) {
    return sendJson(response, 200, {
      data: {
        exportApplication: {
          application: {
            ...(isPlainObject(syncedManifest) &&
            isPlainObject(syncedManifest.application)
              ? syncedManifest.application
              : {}),
            sourceType: 'LOCAL',
          },
          manifest: syncedManifest,
          coverage: [],
          files: [],
        },
      },
    });
  }

  if (query.includes('applicationCoreGraphqlSchema')) {
    return sendJson(response, 200, {
      data: {
        applicationCoreGraphqlSchema: 'type Query { demoGreeting: String }',
      },
    });
  }

  return sendJson(response, 400, { errors: [{ message: 'Unexpected' }] });
});

const runJson = async (args: string[]) => {
  const result = await runCliForTest([...args, '--json']);

  return { ...result, envelope: parseSingleJsonLine(result.stdout) };
};

describe('app commands with the repository SDK', () => {
  beforeEach(() => {
    vi.stubEnv('TWENTY_API_URL', server.url);
    vi.stubEnv('TWENTY_API_KEY', 'real-sdk-test-key');
    vi.stubEnv('TWENTY_REMOTE', '');
    vi.stubEnv('CI', '');
    server.requests.length = 0;
  });

  afterEach(() => vi.unstubAllEnvs());

  afterAll(() => server.close());

  it('builds a real app', async () => {
    const snapshotsBefore = await listSnapshots();
    const { envelope, exitCode } = await runJson([
      'app',
      'build',
      '--path',
      APP_PATH,
    ]);

    expect(exitCode, JSON.stringify(envelope)).toBe(0);
    expect(envelope.data.sdk.protocolVersion).toBe(1);
    expect(envelope.data.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'built-logic-function' }),
      ]),
    );
    expect(await listSnapshots()).toEqual(snapshotsBefore);
  }, 120_000);

  it('uploads a real build, releases its snapshot and generates an isolated client with the project SDK', async () => {
    const appPath = await mkdtemp(join(tmpdir(), 'twenty-cli-real-apply-'));

    try {
      await cp(APP_PATH, appPath, {
        recursive: true,
        filter: (source) =>
          !['node_modules', '.twenty'].includes(basename(source)),
      });
      await mkdir(join(appPath, 'node_modules'));
      for (const name of [
        'twenty-sdk',
        'twenty-ui',
        'react',
        'react-dom',
        '@types',
      ]) {
        await symlink(
          join(REPOSITORY_ROOT, 'node_modules', name),
          join(appPath, 'node_modules', name),
          'dir',
        );
      }
      const clientPath = join(appPath, 'node_modules', 'twenty-client-sdk');

      await mkdir(join(clientPath, 'dist'), { recursive: true });
      await writeFile(
        join(clientPath, 'package.json'),
        JSON.stringify({ name: 'twenty-client-sdk' }),
      );
      await writeFile(
        join(clientPath, 'dist', 'metadata.cjs'),
        'metadata client',
      );
      const { envelope, exitCode } = await runJson([
        'app',
        'apply',
        '--path',
        appPath,
      ]);
      const uploadTargets = server.requests.find(({ body, method }) =>
        method === 'POST'
          ? readGraphqlBody(body).query.includes('createApplicationFileUploads')
          : false,
      );
      const puts = server.requests.filter(({ method }) => method === 'PUT');

      expect(exitCode, JSON.stringify(envelope)).toBe(0);
      expect(envelope.data.clientGeneration).toBe('generated');
      expect(envelope.data.pullBase).toBe('recorded');
      expect(
        JSON.parse(
          await readFile(join(appPath, '.twenty/cli/pull-base.json'), 'utf8'),
        ).manifest,
      ).toEqual(syncedManifest);
      expect(envelope.data.completedPhases.slice(-3)).toEqual([
        'sync',
        'pullBase',
        'clientGeneration',
      ]);
      expect(envelope.data.upload.fileCount).toBeGreaterThan(0);
      expect(puts).toHaveLength(envelope.data.upload.fileCount);
      expect(puts.every(({ body }) => body.length > 0)).toBe(true);
      expect(
        isDefined(uploadTargets) &&
          readGraphqlBody(uploadTargets.body).variables,
      ).toMatchObject({
        files: expect.arrayContaining([
          expect.objectContaining({ fileFolder: 'BuiltLogicFunction' }),
        ]),
      });
      expect(await readdir(join(appPath, '.twenty', 'snapshots'))).toEqual([]);
      expect(
        await readFile(
          join(clientPath, 'dist', 'core/generated/schema.graphql'),
          'utf8',
        ),
      ).toContain('demoGreeting: String');
      expect(
        createRequire(import.meta.url)(join(clientPath, 'dist', 'core.cjs')),
      ).toHaveProperty('CoreApiClient');
      expect(
        await readFile(join(clientPath, 'dist', 'metadata.cjs'), 'utf8'),
      ).toBe('metadata client');
    } finally {
      await rm(appPath, { recursive: true, force: true });
    }
  }, 120_000);
});
