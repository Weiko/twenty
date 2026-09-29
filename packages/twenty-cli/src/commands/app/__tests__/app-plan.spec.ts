import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    execArgv: ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON'],
  }),
}));

const APPLICATION = {
  universalIdentifier: 'app-id',
  name: 'plan-app',
  displayName: 'Plan App',
};
const MANIFEST = { application: APPLICATION };
const ACTIONS = [
  {
    type: 'create',
    metadataName: 'logicFunction',
    flatEntity: { name: 'sendWelcome', universalIdentifier: 'function-id' },
  },
  {
    type: 'update',
    metadataName: 'fieldMetadata',
    universalIdentifier: 'field-id',
    flatEntity: { name: 'name' },
    diff: { label: { before: 'Name', after: 'Full name' } },
  },
  {
    type: 'delete',
    metadataName: 'objectMetadata',
    universalIdentifier: 'object-id',
    flatEntity: { nameSingular: 'company' },
  },
  {
    type: 'delete',
    metadataName: 'view',
    universalIdentifier: 'view-id',
    flatEntity: { name: 'Old view' },
  },
];

const planResponse = (
  actions: unknown = ACTIONS,
  applicationUniversalIdentifier = 'app-id',
) => ({
  data: { syncApplication: { applicationUniversalIdentifier, actions } },
});

const state: { response: unknown; status: number } = {
  response: planResponse(),
  status: 200,
};
const server = await startTestServer((_request, response) => {
  sendJson(response, state.status, state.response);
});

const graphqlError = (
  code: string,
  subCode?: string,
  path = 'syncApplication',
) => ({
  data: null,
  errors: [
    {
      message: 'The server refused the preview.',
      path: [path],
      extensions: { code, subCode },
    },
  ],
});

describe('app plan', () => {
  let appPath: string;
  let sdkPath: string;

  const run = (...args: string[]) =>
    runCliForTest(['app', 'plan', '--path', appPath, ...args]);
  const runJson = async (...args: string[]) => {
    const result = await run(...args, '--json');

    return { ...result, envelope: parseSingleJsonLine(result.stdout) };
  };
  const writeBuild = async (overrides: Record<string, unknown> = {}) => {
    const build = {
      buildId: 'build-id',
      contentHash: 'a'.repeat(64),
      application: APPLICATION,
      manifestFormat: 'twenty-application',
      manifest: MANIFEST,
      files: [],
      ...overrides,
    };

    await writeFile(
      join(sdkPath, 'build.cjs'),
      `
      const fs = require('node:fs');
      exports.buildAppSnapshot = async () => {
        console.log('project output');
        fs.appendFileSync(__dirname + '/builds.txt', 'built\\n');
        return { success: true, data: ${JSON.stringify(build)}, diagnostics: [] };
      };
      exports.releaseAppSnapshot = async ({ buildId }) => {
        fs.writeFileSync(__dirname + '/released.txt', buildId);
        return { success: true, data: null, diagnostics: [] };
      };
    `,
    );
  };

  beforeEach(async () => {
    appPath = await mkdtemp(join(tmpdir(), 'twenty-cli-plan-'));
    sdkPath = join(appPath, 'node_modules', 'twenty-sdk');
    await mkdir(sdkPath, { recursive: true });
    await writeFile(
      join(appPath, 'package.json'),
      JSON.stringify({
        name: 'plan-app',
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
    await writeBuild();
    await mkdir(join(appPath, '.twenty'), { recursive: true });
    await writeFile(join(appPath, '.twenty', 'base.json'), 'existing base');
    vi.stubEnv('TWENTY_API_URL', server.url);
    vi.stubEnv('TWENTY_API_KEY', 'plan-test-key');
    vi.stubEnv('TWENTY_REMOTE', '');
    state.response = planResponse();
    state.status = 200;
    server.requests.length = 0;
  });

  afterEach(() => vi.unstubAllEnvs());
  afterAll(() => server.close());

  it.each([true, false])(
    'requests only a dry run with deletion inference %s',
    async (inferDeletion) => {
      const options = inferDeletion ? [] : ['--no-delete'];
      const { envelope, exitCode, stdout } = await runJson(...options);

      expect(exitCode).toBe(0);
      expect(envelope).toMatchObject({
        command: 'app plan',
        target: { apiUrl: server.url },
        data: {
          application: APPLICATION,
          advisory: true,
          inferDeletionFromMissingEntities: options.length === 0,
          actions: ACTIONS,
          summary: { create: 1, update: 1, delete: 2, destructive: 1 },
        },
      });
      expect(envelope.data).not.toHaveProperty('manifest');
      expect(stdout).not.toContain('plan-test-key');
      expect(envelope.data.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'PROJECT_OUTPUT' }),
        ]),
      );
      expect(server.requests).toHaveLength(1);
      expect(server.requests[0]).toMatchObject({
        path: '/metadata',
        headers: { authorization: 'Bearer plan-test-key' },
      });
      expect(JSON.parse(server.requests[0].body)).toMatchObject({
        query: expect.stringContaining('dryRun: true'),
        variables: {
          manifest: MANIFEST,
          inferDeletionFromMissingEntities: options.length === 0,
        },
      });
      expect(await readFile(join(sdkPath, 'builds.txt'), 'utf8')).toBe(
        'built\n',
      );
      expect(await readFile(join(sdkPath, 'released.txt'), 'utf8')).toBe(
        'build-id',
      );
      expect(
        await readFile(join(appPath, '.twenty', 'base.json'), 'utf8'),
      ).toBe('existing base');
    },
  );

  it('shows every deletion, the selected target and the advisory limitation', async () => {
    const { stdout, exitCode } = await run();

    expect(exitCode).toBe(0);
    for (const text of [
      'Advisory plan',
      server.url,
      'company',
      'Old view',
      'permanently delete stored data',
      '--no-delete',
      'Nothing was registered',
      'different actions',
    ]) {
      expect(stdout).toContain(text);
    }
    expect(stdout).not.toContain('project output');
  });

  it('reports an empty plan as an advisory success', async () => {
    state.response = planResponse([]);
    const { stdout, exitCode } = await run();

    expect(exitCode).toBe(0);
    expect(stdout).toContain('No changes.');
    expect(stdout).toContain('Advisory');
  });

  it('bounds human table widths without truncating actions or JSON names', async () => {
    const name = 'very-long-name-'.repeat(1000);
    const action = {
      type: 'delete',
      metadataName: 'view',
      universalIdentifier: 'long-view',
      flatEntity: { name },
    };

    state.response = planResponse([action, ...ACTIONS]);
    const human = await run();
    const { envelope, exitCode } = await runJson();

    expect(human.exitCode).toBe(0);
    expect(human.stdout.length).toBeLessThan(2500);
    expect(human.stdout).toContain('Old view');
    expect(human.stdout).toContain('3 to delete');
    expect(exitCode).toBe(0);
    expect(envelope.data.actions[0].flatEntity.name).toBe(name);
  });

  it('refuses an unregistered app without creating it', async () => {
    state.response = graphqlError('NOT_FOUND', 'APPLICATION_NOT_FOUND');
    const { envelope, exitCode } = await runJson();

    expect(exitCode).toBe(1);
    expect(envelope.error).toMatchObject({
      code: 'PLAN_UNAVAILABLE',
      hint: expect.stringContaining('twenty-sdk'),
      details: { advisory: true, applicationUniversalIdentifier: 'app-id' },
    });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].body).not.toMatch(
      /createApplication|createDevelopment|FileUpload/,
    );
    expect(await readFile(join(sdkPath, 'released.txt'), 'utf8')).toBe(
      'build-id',
    );
  });

  it.each([
    ['FORBIDDEN', undefined, 'syncApplication', 'PERMISSION_DENIED', 3],
    ['UNAUTHENTICATED', undefined, 'syncApplication', 'AUTH_REQUIRED', 3],
    ['NOT_FOUND', 'FIELD_NOT_FOUND', 'syncApplication', 'GRAPHQL_ERROR', 1],
    ['NOT_FOUND', undefined, 'syncApplication', 'GRAPHQL_ERROR', 1],
    ['NOT_FOUND', 'APPLICATION_NOT_FOUND', 'anotherField', 'GRAPHQL_ERROR', 1],
    [
      'BAD_USER_INPUT',
      'SERVER_VERSION_INCOMPATIBLE',
      'syncApplication',
      'GRAPHQL_ERROR',
      1,
    ],
  ] as const)(
    'preserves the server refusal %s/%s at %s',
    async (code, subCode, path, expectedCode, expectedExitCode) => {
      state.response = graphqlError(String(code), subCode, path);
      const { envelope, exitCode } = await runJson();

      expect(exitCode).toBe(expectedExitCode);
      expect(envelope.error.code).toBe(expectedCode);
      expect(server.requests).toHaveLength(1);
    },
  );

  it.each([
    null,
    [],
    planResponse(null),
    planResponse(ACTIONS, 'another-app'),
    planResponse([{ type: 'delete', metadataName: 'objectMetadata' }]),
    planResponse([{ type: 'unknown', metadataName: 'fieldMetadata' }]),
    planResponse([
      {
        type: 'update',
        metadataName: 'fieldMetadata',
        universalIdentifier: 'id',
        diff: { label: 'invalid' },
      },
    ]),
  ])('rejects malformed preview %j', async (response) => {
    state.response = response;
    const { envelope, exitCode } = await runJson();

    expect(exitCode).toBe(1);
    expect(envelope.error.code).toBe('INVALID_RESPONSE');
  });

  it('fails instead of truncating a plan over the action limit', async () => {
    state.response = planResponse(
      Array.from({ length: 10001 }, () => ACTIONS[0]),
    );
    const { envelope, exitCode } = await runJson();

    expect(exitCode).toBe(1);
    expect(envelope.error.code).toBe('RESPONSE_LIMIT_EXCEEDED');
  });

  it('accepts a diff whose undefined side was omitted by JSON serialization', async () => {
    const action = {
      type: 'update',
      metadataName: 'fieldMetadata',
      universalIdentifier: 'field-id',
      diff: { description: { after: 'New description' } },
    };

    state.response = planResponse([action]);
    const { envelope, exitCode } = await runJson();

    expect(exitCode).toBe(0);
    expect(envelope.data.actions).toEqual([action]);
  });

  it('does not expose an unvalidated partial plan on GraphQL failure', async () => {
    state.response = {
      ...graphqlError('METADATA_VALIDATION_FAILED'),
      data: {
        syncApplication: {
          actions: [
            { metadataName: 'applicationVariable', value: 'SECRET_PARTIAL' },
          ],
        },
      },
    };
    const { envelope, stdout, stderr, exitCode } = await runJson();

    expect(exitCode).toBe(1);
    expect(envelope.error).toMatchObject({
      code: 'GRAPHQL_ERROR',
      details: { data: null },
    });
    expect(stdout + stderr).not.toContain('SECRET_PARTIAL');
  });

  it('does not interpret an endpoint 404 as a missing app registration', async () => {
    state.status = 404;
    state.response = { message: 'Endpoint missing' };
    const { envelope, exitCode } = await runJson();

    expect(exitCode).toBe(4);
    expect(envelope.error.code).toBe('NOT_FOUND');
    expect(server.requests).toHaveLength(1);
  });

  it('rejects an unsupported SDK before contacting the workspace', async () => {
    await writeFile(
      join(sdkPath, 'descriptor.json'),
      JSON.stringify({
        protocolVersion: 2,
        requiredNode: '24',
        capabilities: ['build', 'releaseSnapshot'],
      }),
    );
    const { envelope, exitCode } = await runJson();

    expect(exitCode).toBe(1);
    expect(envelope.error.code).toBe('TOOLING_UNSUPPORTED');
    expect(server.requests).toHaveLength(0);
    await expect(readFile(join(sdkPath, 'builds.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it.each([true, false, undefined])(
    'redacts variable values with isSecret %s, including previous values',
    async (isSecret) => {
      state.response = planResponse([
        {
          type: 'update',
          metadataName: 'applicationVariable',
          universalIdentifier: 'variable-id',
          flatEntity: { name: 'API_TOKEN', value: 'SECRET_AFTER', isSecret },
          diff: {
            value: { before: 'SECRET_BEFORE', after: 'SECRET_AFTER' },
            isSecret: { before: true, after: isSecret ?? null },
          },
        },
      ]);
      const { stdout, stderr, envelope, exitCode } = await runJson();

      expect(exitCode).toBe(0);
      expect(stdout + stderr).not.toContain('SECRET_');
      expect(envelope.data.actions[0]).toMatchObject({
        flatEntity: { value: '(redacted)' },
        diff: { value: { before: '(redacted)', after: '(redacted)' } },
      });
    },
  );

  it.each([
    { manifestFormat: 'future-format' },
    { manifest: { application: { universalIdentifier: 'other-app' } } },
  ])(
    'rejects an incompatible build %j before any request',
    async (overrides) => {
      await writeBuild(overrides);
      const { envelope, exitCode } = await runJson();

      expect(exitCode).toBe(1);
      expect(envelope.error.code).toBe('TOOLING_UNSUPPORTED');
      expect(server.requests).toHaveLength(0);
    },
  );

  it('advertises the read-only preview and its permission in the catalog', async () => {
    const { stdout } = await runCliForTest(['commands', '--json']);

    expect(parseSingleJsonLine(stdout).data.commands).toContainEqual(
      expect.objectContaining({
        name: 'app plan',
        writes: false,
        needsProject: true,
        needsTarget: true,
        requiredPermissions: ['APPLICATIONS'],
        flags: expect.arrayContaining(['--no-delete']),
      }),
    );
    expect(server.requests).toHaveLength(0);
  });
});
