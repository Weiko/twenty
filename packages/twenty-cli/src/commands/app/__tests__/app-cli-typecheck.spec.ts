import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  afterAll,
  afterEach,
  beforeAll,
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
import { buildTestAppWorker } from '@/app/__tests__/utils/build-test-app-worker';

const launch = vi.hoisted(() => ({ modulePath: '', execArgv: [] as string[] }));

vi.mock('@/app/get-app-worker-launch', () => ({
  getAppWorkerLaunch: () => launch,
}));

describe('app typecheck with CLI tooling', () => {
  let workerDirectory: string;
  let appPath: string;

  const run = async (...options: string[]) => {
    const result = await runCliForTest([
      'app',
      'typecheck',
      '--path',
      appPath,
      '--json',
      ...options,
    ]);
    return { ...result, envelope: parseSingleJsonLine(result.stdout) };
  };

  beforeAll(async () => {
    workerDirectory = await mkdtemp(
      join(tmpdir(), 'twenty-cli-typecheck-worker-'),
    );
    await buildTestAppWorker(workerDirectory);
    launch.modulePath = join(workerDirectory, 'app-worker.cjs');
  }, 60_000);

  afterAll(() => rm(workerDirectory, { recursive: true, force: true }));

  beforeEach(async () => {
    appPath = await mkdtemp(join(tmpdir(), 'twenty-cli-typecheck-app-'));
    const sdkPath = join(appPath, 'node_modules/twenty-sdk');
    await mkdir(sdkPath, { recursive: true });
    await writeFile(
      join(appPath, 'package.json'),
      JSON.stringify({
        name: 'typecheck-app',
        devDependencies: { 'twenty-sdk': '2.42.0', typescript: '^5.9.3' },
      }),
    );
    await writeFile(
      join(sdkPath, 'package.json'),
      JSON.stringify({
        name: 'twenty-sdk',
        version: '2.42.0',
        exports: {
          './define': './index.cjs',
          './front-component': './index.cjs',
        },
      }),
    );
    await writeFile(
      join(sdkPath, 'index.cjs'),
      "throw new Error('Typechecking must not load the authoring SDK');",
    );
    await symlink(
      dirname(
        createRequire(import.meta.url).resolve('typescript/package.json'),
      ),
      join(appPath, 'node_modules/typescript'),
    );
    await writeFile(
      join(appPath, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { strict: true, types: [], skipLibCheck: true },
        include: ['*.ts'],
      }),
    );
    await writeFile(
      join(appPath, 'application.ts'),
      'export const name: string = "Example";',
    );
  });

  afterEach(() => rm(appPath, { recursive: true, force: true }));

  it('uses the project compiler without an SDK build API', async () => {
    const result = await run();
    expect(result.exitCode, result.stdout).toBe(0);
    expect(result.envelope.data).toMatchObject({
      sdk: { version: '2.42.0', protocolVersion: 1 },
      diagnostics: [],
    });
    const legacy = await run('--legacy-sdk');
    expect(legacy.exitCode).toBe(1);
    expect(legacy.envelope.error.code).toBe('TOOLING_UNSUPPORTED');
  });

  it('reports project diagnostics through the public command', async () => {
    await writeFile(
      join(appPath, 'application.ts'),
      'export const name: string = 42;',
    );
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.envelope.error).toMatchObject({
      code: 'TYPECHECK_FAILED',
      details: {
        diagnostics: [
          expect.objectContaining({ code: 'TS2322', file: 'application.ts' }),
        ],
      },
    });
  });

  it('reports the missing project compiler without borrowing the CLI compiler', async () => {
    await rm(join(appPath, 'node_modules/typescript'));
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.envelope.error.code).toBe('TYPESCRIPT_NOT_INSTALLED');
  });

  it('fails on a missing TypeScript configuration', async () => {
    await rm(join(appPath, 'tsconfig.json'));
    const result = await run();
    expect(result.exitCode).toBe(1);
    expect(result.envelope.error).toMatchObject({
      code: 'TYPECHECK_FAILED',
      details: { diagnostics: [expect.objectContaining({ code: 'TS5083' })] },
    });
  });

  it('keeps the migration fallback out of normal discovery', async () => {
    const help = await runCliForTest(['app', 'typecheck', '--help']);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).not.toContain('--legacy-sdk');
    const commands = await runCliForTest(['commands', '--json']);
    expect(commands.exitCode).toBe(0);
    expect(commands.stdout).not.toContain('--legacy-sdk');
  });
});
