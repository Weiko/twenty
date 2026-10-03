import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import Module from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isFunction } from '@sniptt/guards';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  parseSingleJsonLine,
  runCliForTest,
} from '@/__tests__/utils/run-cli-for-test';

const initializeModulePaths = () => {
  if (!('_initPaths' in Module) || !isFunction(Module._initPaths)) {
    throw new Error('node:module does not expose _initPaths.');
  }

  Module._initPaths();
};

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

vi.mock('@/app/constants/app-worker.constant', () => ({
  APP_WORKER: { CANCEL_GRACE_MILLISECONDS: 300, OUTPUT_LIMIT_BYTES: 2048 },
}));

const SUCCESSFUL_BUILD = `return {
  success: true,
  data: {
    buildId: 'build-1',
    directory: path.join(appPath, '.twenty', 'snapshots', 'build-1', 'files'),
    contentHash: 'c'.repeat(64),
    application: { universalIdentifier: 'app-id', name: 'fake-app', displayName: 'Fake App' },
    manifestFormat: 'twenty-application',
    manifest: { application: { universalIdentifier: 'app-id' } },
    files: [
      { path: 'src/hello.mjs', role: 'built-logic-function', sourcePath: 'src/hello.ts', size: 1200, sha256: 'a'.repeat(64) },
      { path: 'src/hello.ts', role: 'source', sourcePath: 'src/hello.ts', size: 300, sha256: 'b'.repeat(64) },
    ],
  },
  diagnostics: [{ severity: 'warning', code: 'BUILD_WARNING', message: 'A deprecated option is used.' }],
};`;

const SUCCESSFUL_TYPECHECK = `return { success: true, data: null, diagnostics: [] };`;

const exists = (filePath: string) =>
  access(filePath).then(
    () => true,
    () => false,
  );

const createApp = async (name = 'fake-app') => {
  const root = await mkdtemp(join(tmpdir(), 'twenty-cli-app-'));
  const appPath = join(root, name);

  await mkdir(join(appPath, 'src'), { recursive: true });
  await writeFile(
    join(appPath, 'package.json'),
    JSON.stringify({ name, devDependencies: { 'twenty-sdk': '9.9.9' } }),
  );

  return { root, appPath };
};

const writeFakeSdk = async ({
  appPath,
  version = '9.9.9',
  descriptor = {},
  hasBuildApi = true,
  build = SUCCESSFUL_BUILD,
  typecheck = SUCCESSFUL_TYPECHECK,
  exportedFunctions = [
    'buildAppSnapshot',
    'typecheckApp',
    'releaseAppSnapshot',
  ],
}: {
  appPath: string;
  version?: string;
  descriptor?: Record<string, unknown>;
  hasBuildApi?: boolean;
  build?: string;
  typecheck?: string;
  exportedFunctions?: string[];
}) => {
  const functionSources: Record<string, string> = {
    buildAppSnapshot: `async ({ signal }) => { ${build} }`,
    typecheckApp: `async ({ signal }) => { ${typecheck} }`,
    releaseAppSnapshot: `async ({ buildId }) => {
    mark('released.txt', buildId);
    return { success: true, data: null, diagnostics: [] };
  }`,
  };
  const sdkPath = join(appPath, 'node_modules', 'twenty-sdk');

  await mkdir(join(sdkPath, 'dist', 'build'), { recursive: true });
  await writeFile(
    join(sdkPath, 'package.json'),
    JSON.stringify({
      name: 'twenty-sdk',
      version,
      exports: hasBuildApi
        ? {
            '.': './dist/index.cjs',
            './build': { require: './dist/build.cjs' },
            './build/descriptor.json': './dist/build/descriptor.json',
          }
        : { '.': './dist/index.cjs' },
    }),
  );
  await writeFile(join(sdkPath, 'dist', 'index.cjs'), 'module.exports = {};');
  await writeFile(
    join(sdkPath, 'dist', 'build', 'descriptor.json'),
    JSON.stringify({
      protocolVersion: 1,
      sdkVersion: version,
      requiredNode: '^24.5.0',
      capabilities: ['build', 'typecheck', 'releaseSnapshot'],
      fileWrites: {},
      ...descriptor,
    }),
  );
  await writeFile(
    join(sdkPath, 'dist', 'build.cjs'),
    `const fs = require('node:fs');
const path = require('node:path');
const appPath = path.resolve(__dirname, '../../..');
const mark = (name, content = '') => fs.writeFileSync(path.join(appPath, name), content);
mark('loaded.txt');
module.exports = {
${exportedFunctions.map((name) => `  ${name}: ${functionSources[name]},`).join('\n')}
};`,
  );
};

const runJson = async (args: string[]) => {
  const result = await runCliForTest([...args, '--legacy-sdk', '--json']);

  return { ...result, envelope: parseSingleJsonLine(result.stdout) };
};

describe('app build and typecheck with the legacy SDK fallback', () => {
  beforeEach(() => {
    vi.stubEnv('CI', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("builds with the app's own SDK version and releases the snapshot", async () => {
    const { appPath } = await createApp();

    await writeFakeSdk({ appPath, version: '9.9.9' });

    const { envelope, exitCode } = await runJson([
      'app',
      'build',
      '--path',
      appPath,
    ]);

    expect(exitCode).toBe(0);
    expect(envelope.data).toMatchObject({
      app: { path: appPath, name: 'fake-app' },
      sdk: { version: '9.9.9', protocolVersion: 1 },
      application: { displayName: 'Fake App' },
      contentHash: 'c'.repeat(64),
      diagnostics: [{ severity: 'warning', code: 'BUILD_WARNING' }],
    });
    expect(envelope.data.files).toHaveLength(2);
    expect(envelope).not.toHaveProperty('target');
    expect(await exists(join(appPath, 'released.txt'))).toBe(true);
  });

  it('prints a readable summary in human mode', async () => {
    const { appPath } = await createApp();

    await writeFakeSdk({ appPath });

    const { stdout, stderr, exitCode } = await runCliForTest([
      'app',
      'build',
      '--legacy-sdk',
      '--path',
      appPath,
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toContain('Building fake-app with twenty-sdk 9.9.9');
    expect(stderr).toContain('A deprecated option is used.');
    expect(stdout).toContain('Built Fake App with twenty-sdk 9.9.9');
    expect(stdout).toContain('2 files · 1.5 KB');
    expect(stdout).toContain('1 logic function · 1 source file');
    expect(stdout).toContain('Nothing was uploaded.');
  });

  it('keeps the original diagnostic when the worker throws instead of returning a result', async () => {
    const { appPath } = await createApp();
    await writeFakeSdk({
      appPath,
      build: `throw Object.assign(new Error('The entry file is missing.'), {
        code: 'ENOENT',
        hint: 'Restore src/function.ts before building.',
        details: { path: 'src/function.ts', exitCode: 99, output: 'untrusted' },
      });`,
    });

    const result = await runJson(['app', 'build', '--path', appPath]);
    expect(result.exitCode).toBe(1);
    expect(result.envelope.error).toMatchObject({
      code: 'WORKER_FAILED',
      message: 'The app worker failed: The entry file is missing.',
      hint: 'Restore src/function.ts before building.',
      details: {
        workerErrorCode: 'ENOENT',
        path: 'src/function.ts',
        exitCode: 0,
        output: { stdout: '', stderr: '', isTruncated: false },
      },
    });
  });

  it('keeps recovery hints and failure details through worker results in JSON and human output', async () => {
    const { appPath } = await createApp();
    await writeFakeSdk({
      appPath,
      build: `return {
        success: false,
        error: {
          code: 'MISSING_ENTRY',
          message: 'The entry file is missing.',
          hint: 'Restore src/function.ts before building.',
          details: { path: 'src/function.ts', sdkVersion: 'untrusted', diagnostics: [] },
        },
        diagnostics: [{ severity: 'warning', code: 'BUILD_WARNING', message: 'Check the app entry.' }],
      };`,
    });

    const result = await runJson(['app', 'build', '--path', appPath]);
    expect(result.exitCode).toBe(1);
    expect(result.envelope.error).toMatchObject({
      code: 'BUILD_FAILED',
      hint: 'Restore src/function.ts before building.',
      details: {
        path: 'src/function.ts',
        sdkErrorCode: 'MISSING_ENTRY',
        sdkVersion: '9.9.9',
        diagnostics: [expect.objectContaining({ code: 'BUILD_WARNING' })],
      },
    });
    const human = await runCliForTest([
      'app',
      'build',
      '--legacy-sdk',
      '--path',
      appPath,
    ]);
    expect(human.exitCode).toBe(1);
    expect(human.stderr).toContain('Restore src/function.ts before building.');
  });

  it('typechecks with an SDK that only supports typecheck', async () => {
    const { appPath } = await createApp();

    await writeFakeSdk({
      appPath,
      descriptor: { capabilities: ['typecheck'] },
      exportedFunctions: ['typecheckApp'],
    });

    const typecheck = await runJson(['app', 'typecheck', '--path', appPath]);

    expect(typecheck.exitCode).toBe(0);
    expect(typecheck.envelope.ok).toBe(true);

    await rm(join(appPath, 'loaded.txt'));

    const build = await runJson(['app', 'build', '--path', appPath]);

    expect(build.exitCode).toBe(1);
    expect(build.envelope.error).toMatchObject({
      code: 'TOOLING_UNSUPPORTED',
      message: expect.stringContaining(
        'does not support build, releaseSnapshot',
      ),
    });
    expect(await exists(join(appPath, 'loaded.txt'))).toBe(false);
  });

  it('finds the app from a nested folder', async () => {
    const { appPath } = await createApp();

    await writeFakeSdk({ appPath });
    vi.spyOn(process, 'cwd').mockReturnValue(join(appPath, 'src'));

    const { envelope, exitCode } = await runJson(['app', 'typecheck']);

    expect(exitCode).toBe(0);
    expect(envelope.data.app.path).toBe(appPath);
  });

  it('asks for --path in a folder with several apps', async () => {
    const { root } = await createApp('first-app');

    await mkdir(join(root, 'second-app'));
    await writeFile(
      join(root, 'second-app', 'package.json'),
      JSON.stringify({
        name: 'second-app',
        dependencies: { 'twenty-sdk': '1.0.0' },
      }),
    );
    vi.spyOn(process, 'cwd').mockReturnValue(root);

    const { envelope, exitCode } = await runJson(['app', 'build']);

    expect(exitCode).toBe(2);
    expect(envelope.error.code).toBe('APP_PATH_REQUIRED');
    expect(envelope.error.details.candidates).toEqual([
      join(root, 'first-app'),
      join(root, 'second-app'),
    ]);
  });

  it.each([
    ['a folder without an app', (root: string) => root],
    ['a path that is not an app', (root: string) => join(root, 'missing')],
  ])('refuses %s', async (_, getPath) => {
    const root = await mkdtemp(join(tmpdir(), 'twenty-cli-empty-'));

    vi.spyOn(process, 'cwd').mockReturnValue(root);

    const { envelope, exitCode } = await runJson(
      getPath(root) === root
        ? ['app', 'build']
        : ['app', 'build', '--path', getPath(root)],
    );

    expect(exitCode).toBe(2);
    expect(envelope.error.code).toBe('APP_NOT_FOUND');
  });

  describe('refuses before loading any SDK code', () => {
    it.each([
      [
        'when twenty-sdk is not installed',
        async (appPath: string) => appPath,
        'SDK_NOT_INSTALLED',
        'twenty-sdk is not installed for this app.',
      ],
      [
        "when the app uses Yarn Plug'n'Play",
        async (appPath: string) => {
          await writeFile(join(appPath, '.pnp.cjs'), '');

          return appPath;
        },
        'TOOLING_UNSUPPORTED',
        "Yarn Plug'n'Play",
      ],
      [
        'when the SDK has no build API',
        async (appPath: string) => {
          await writeFakeSdk({
            appPath,
            version: '2.13.0',
            hasBuildApi: false,
          });

          return appPath;
        },
        'TOOLING_UNSUPPORTED',
        'twenty-sdk 2.13.0 in this app has no build API',
      ],
      [
        'when the SDK speaks a newer protocol',
        async (appPath: string) => {
          await writeFakeSdk({ appPath, descriptor: { protocolVersion: 2 } });

          return appPath;
        },
        'TOOLING_UNSUPPORTED',
        'uses build protocol 2; this CLI supports protocol 1',
      ],
      [
        'when the SDK lacks a required capability',
        async (appPath: string) => {
          await writeFakeSdk({
            appPath,
            descriptor: { capabilities: ['build'] },
          });

          return appPath;
        },
        'TOOLING_UNSUPPORTED',
        'does not support releaseSnapshot',
      ],
      [
        'when the SDK needs another Node version',
        async (appPath: string) => {
          await writeFakeSdk({
            appPath,
            descriptor: { requiredNode: '>=99.0.0' },
          });

          return appPath;
        },
        'NODE_VERSION_UNSUPPORTED',
        'needs Node >=99.0.0',
      ],
      [
        'when the SDK declares a Node range it cannot read',
        async (appPath: string) => {
          await writeFakeSdk({
            appPath,
            descriptor: { requiredNode: 'latest' },
          });

          return appPath;
        },
        'TOOLING_UNSUPPORTED',
        'Node requirement this CLI cannot read: latest',
      ],
    ])('%s', async (_, prepare, code, message) => {
      const { appPath } = await createApp();

      await prepare(appPath);

      const { envelope, exitCode } = await runJson([
        'app',
        'build',
        '--path',
        appPath,
      ]);

      expect(exitCode).toBe(1);
      expect(envelope.error.code).toBe(code);
      expect(envelope.error.message).toContain(message);
      expect(await exists(join(appPath, 'loaded.txt'))).toBe(false);
    });

    it('never uses an SDK found only through global module paths', async () => {
      const { appPath } = await createApp();
      const globalRoot = await mkdtemp(join(tmpdir(), 'twenty-cli-global-'));
      await writeFakeSdk({ appPath: globalRoot });
      vi.stubEnv('NODE_PATH', join(globalRoot, 'node_modules'));
      initializeModulePaths();

      try {
        const { envelope, exitCode } = await runJson([
          'app',
          'build',
          '--path',
          appPath,
        ]);

        expect(exitCode).toBe(1);
        expect(envelope.error.code).toBe('SDK_NOT_INSTALLED');
        expect(await exists(join(globalRoot, 'loaded.txt'))).toBe(false);
      } finally {
        vi.unstubAllEnvs();
        initializeModulePaths();
      }
    });

    it('does not skip a broken nearer installation for a hoisted SDK', async () => {
      const { root, appPath } = await createApp();

      await writeFakeSdk({ appPath: root });
      await mkdir(join(appPath, 'node_modules', 'twenty-sdk'), {
        recursive: true,
      });

      const { envelope, exitCode } = await runJson([
        'app',
        'build',
        '--path',
        appPath,
      ]);

      expect(exitCode).toBe(1);
      expect(envelope.error.code).toBe('TOOLING_UNSUPPORTED');
      expect(envelope.error.message).toContain('is incomplete');
      expect(await exists(join(root, 'loaded.txt'))).toBe(false);
    });

    it('uses a hoisted SDK when the app has no nearer installation', async () => {
      const { root, appPath } = await createApp();

      await writeFakeSdk({ appPath: root, version: '8.8.8' });

      const { envelope, exitCode } = await runJson([
        'app',
        'build',
        '--path',
        appPath,
      ]);

      expect(exitCode).toBe(0);
      expect(envelope.data.sdk.version).toBe('8.8.8');
    });

    it('explains how to upgrade when the CLI is older than the SDK', async () => {
      const { appPath } = await createApp();

      await writeFakeSdk({ appPath, descriptor: { protocolVersion: 2 } });

      const { envelope } = await runJson(['app', 'build', '--path', appPath]);

      expect(envelope.error.hint).toBe('Upgrade the twenty CLI.');
    });
  });

  describe('isolates the worker', () => {
    it('keeps JSON clean when app code prints, and reports the output', async () => {
      const { appPath } = await createApp();

      await writeFakeSdk({
        appPath,
        build: `console.log('noise from app code'); console.error('x'.repeat(5000)); ${SUCCESSFUL_BUILD}`,
      });

      const { envelope, exitCode } = await runJson([
        'app',
        'build',
        '--path',
        appPath,
      ]);
      const outputDiagnostics = envelope.data.diagnostics.filter(
        (diagnostic: { code: string }) => diagnostic.code === 'PROJECT_OUTPUT',
      );

      expect(exitCode).toBe(0);
      expect(outputDiagnostics).toHaveLength(2);
      expect(outputDiagnostics[0].message).toContain('noise from app code');
      expect(outputDiagnostics[1].message).toContain('(output truncated)');
    });

    it('reports a structured error when app code exits the process', async () => {
      const { appPath } = await createApp();

      await writeFakeSdk({
        appPath,
        build: `console.error('about to exit'); process.exit(7);`,
      });

      const { envelope, exitCode } = await runJson([
        'app',
        'build',
        '--path',
        appPath,
      ]);

      expect(exitCode).toBe(1);
      expect(envelope.error.code).toBe('WORKER_FAILED');
      expect(envelope.error.details.exitCode).toBe(7);
      expect(envelope.error.details.output.stderr).toContain('about to exit');
    });

    it('never passes CLI credentials or targets to the worker', async () => {
      const { appPath } = await createApp();

      vi.stubEnv('TWENTY_API_URL', 'https://crm.example.com');
      vi.stubEnv('TWENTY_API_KEY', 'secret-key');
      vi.stubEnv('TWENTY_REMOTE', 'prod');
      vi.stubEnv('TWENTY_APP_ACCESS_TOKEN', 'secret-token');
      vi.stubEnv('TWENTY_FUTURE_SERVICE_TOKEN', 'secret-future');
      vi.stubEnv('TWENTY_APP_PUBLISH_DISABLE_PROVENANCE', 'true');
      await writeFakeSdk({
        appPath,
        build: `mark('environment.json', JSON.stringify(Object.keys(process.env).filter((name) => name.startsWith('TWENTY_')))); ${SUCCESSFUL_BUILD}`,
      });

      const { exitCode } = await runJson(['app', 'build', '--path', appPath]);
      const visibleVariables: unknown = JSON.parse(
        await readFile(join(appPath, 'environment.json'), 'utf8'),
      );

      expect(exitCode).toBe(0);
      expect(visibleVariables).toEqual([
        'TWENTY_APP_PUBLISH_DISABLE_PROVENANCE',
      ]);
    });
  });

  describe('failures', () => {
    it('reports build failures with the SDK diagnostics', async () => {
      const { appPath } = await createApp();

      await writeFakeSdk({
        appPath,
        build: `return {
          success: false,
          error: { code: 'MANIFEST_BUILD_FAILED', message: 'No defineApplication() call found.' },
          diagnostics: [{ severity: 'error', code: 'MANIFEST_BUILD_FAILED', message: 'No defineApplication() call found.' }],
        };`,
      });

      const json = await runJson(['app', 'build', '--path', appPath]);
      const human = await runCliForTest([
        'app',
        'build',
        '--path',
        appPath,
        '--legacy-sdk',
      ]);

      expect(json.exitCode).toBe(1);
      expect(json.envelope.error).toMatchObject({
        code: 'BUILD_FAILED',
        message: 'The build failed: No defineApplication() call found.',
        details: { sdkErrorCode: 'MANIFEST_BUILD_FAILED' },
      });
      expect(human.stderr).toContain('MANIFEST_BUILD_FAILED');
      expect(await exists(join(appPath, 'released.txt'))).toBe(false);
    });

    it('reports type errors with their locations', async () => {
      const { appPath } = await createApp();

      await writeFakeSdk({
        appPath,
        typecheck: `return {
          success: false,
          error: { code: 'TYPECHECK_FAILED', message: 'Typecheck failed.' },
          diagnostics: [{ severity: 'error', code: 'TS2322', message: "Type 'string' is not assignable to type 'number'.", file: 'src/hello.ts', line: 3, column: 7 }],
        };`,
      });

      const json = await runJson(['app', 'typecheck', '--path', appPath]);
      const human = await runCliForTest([
        'app',
        'typecheck',
        '--path',
        appPath,
        '--legacy-sdk',
      ]);

      expect(json.exitCode).toBe(1);
      expect(json.envelope.error).toMatchObject({
        code: 'TYPECHECK_FAILED',
        message: 'Typecheck failed with 1 error.',
      });
      expect(human.stderr).toContain('src/hello.ts:3:7');
      expect(human.stderr).toContain('TS2322');
    });

    it.each([
      [
        'build',
        ['typecheckApp'],
        'must export buildAppSnapshot and releaseAppSnapshot to build the app',
      ],
      [
        'build',
        ['buildAppSnapshot', 'typecheckApp'],
        'must export buildAppSnapshot and releaseAppSnapshot to build the app',
      ],
      [
        'typecheck',
        ['buildAppSnapshot', 'releaseAppSnapshot'],
        'must export typecheckApp to typecheck the app',
      ],
    ])(
      'reports an export the descriptor promised for %s but the SDK lacks (%j)',
      async (operation, exportedFunctions, message) => {
        const { appPath } = await createApp();

        await writeFakeSdk({ appPath, exportedFunctions });

        const { envelope, exitCode } = await runJson([
          'app',
          operation,
          '--path',
          appPath,
        ]);

        expect(exitCode).toBe(1);
        expect(envelope.error.code).toBe('WORKER_FAILED');
        expect(envelope.error.message).toContain(message);
      },
    );

    it('rejects a result it cannot read', async () => {
      const { appPath } = await createApp();

      await writeFakeSdk({ appPath, build: `return { success: true };` });

      const { envelope, exitCode } = await runJson([
        'app',
        'build',
        '--path',
        appPath,
      ]);

      expect(exitCode).toBe(1);
      expect(envelope.error.code).toBe('WORKER_FAILED');
    });
  });

  describe('cancellation', () => {
    it('cancels the SDK operation on Ctrl+C and exits with 130', async () => {
      const { appPath } = await createApp();

      await writeFakeSdk({
        appPath,
        build: `mark('started.txt');
          await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
          mark('cancelled.txt');
          return { success: false, error: { code: 'CANCELLED', message: 'Cancelled.' }, diagnostics: [] };`,
      });

      const run = runJson(['app', 'build', '--path', appPath]);

      await vi.waitFor(
        () =>
          exists(join(appPath, 'started.txt')).then((started) =>
            expect(started).toBe(true),
          ),
        { timeout: 10_000 },
      );
      process.emit('SIGINT');

      const { envelope, exitCode } = await run;

      expect(exitCode).toBe(130);
      expect(envelope.error.code).toBe('CANCELLED');
      expect(await exists(join(appPath, 'cancelled.txt'))).toBe(true);
      expect(await exists(join(appPath, 'released.txt'))).toBe(false);
    });

    it('stops a worker that ignores cancellation', async () => {
      const { appPath } = await createApp();

      await writeFakeSdk({
        appPath,
        build: `mark('started.txt'); await new Promise(() => undefined);`,
      });

      const run = runJson(['app', 'build', '--path', appPath]);

      await vi.waitFor(
        () =>
          exists(join(appPath, 'started.txt')).then((started) =>
            expect(started).toBe(true),
          ),
        { timeout: 10_000 },
      );
      process.emit('SIGINT');

      const { envelope, exitCode } = await run;

      expect(exitCode).toBe(130);
      expect(envelope.error.code).toBe('CANCELLED');
    });
  });
});
