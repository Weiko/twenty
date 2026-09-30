import { mkdir, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDefined } from 'twenty-shared/utils';
import { build, loadConfigFromFile } from 'vite';
import { vi } from 'vitest';

export const buildTestAppWorker = async (workerPath: string) => {
  const cliRoot = fileURLToPath(new URL('../../../../', import.meta.url));

  const loaded = await loadConfigFromFile(
    { command: 'build', mode: 'production' },
    join(cliRoot, 'vite.config.ts'),
  );

  if (!isDefined(loaded)) {
    throw new Error('Could not load the CLI bundle configuration.');
  }

  vi.stubEnv('NODE_ENV', 'production');

  try {
    await build({
      ...loaded.config,
      configFile: false,
      plugins: [],
      build: {
        ...loaded.config.build,
        outDir: workerPath,
        lib: {
          entry: {
            'app-worker': join(cliRoot, 'src/app/worker/app-worker.ts'),
          },
          formats: ['cjs'],
        },
      },
    });
  } finally {
    vi.unstubAllEnvs();
  }
  await mkdir(join(workerPath, 'node_modules'));
  const resolve = createRequire(import.meta.url).resolve;

  for (const name of ['esbuild', 'typescript', 'tinyglobby']) {
    await symlink(
      dirname(resolve(`${name}/package.json`)),
      join(workerPath, 'node_modules', name),
    );
  }
};
