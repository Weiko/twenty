import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { type Manifest } from 'twenty-shared/application';

import { PULL_BASE_FILE_PATH } from '@/app/constants/pull-base-file-path.constant';
import { assertPullPaths } from '@/app/pull/assert-pull-paths';
import { normalizePullTarget } from '@/app/pull/normalize-pull-target';
import { type PullTarget } from '@/app/types/pull-target.type';
import { CliError } from '@/output/cli-error';

export const writePullBase = async ({
  appPath,
  manifest,
  target,
  signal,
}: {
  appPath: string;
  manifest: Manifest;
  target: PullTarget;
  signal: AbortSignal;
}) => {
  const basePath = join(appPath, PULL_BASE_FILE_PATH);
  const temporaryPath = `${basePath}.${randomUUID()}.tmp`;
  let temporaryFile: Awaited<ReturnType<typeof open>> | undefined;

  try {
    signal.throwIfAborted();
    await assertPullPaths({ appPath, relativePaths: [PULL_BASE_FILE_PATH] });
    await mkdir(dirname(basePath), { recursive: true });
    temporaryFile = await open(temporaryPath, 'wx', 0o600);
    await temporaryFile.writeFile(
      `${JSON.stringify(
        {
          version: 2,
          target: normalizePullTarget(target),
          applicationUniversalIdentifier:
            manifest.application.universalIdentifier,
          manifest,
        },
        null,
        2,
      )}\n`,
    );
    await temporaryFile.sync();
    await temporaryFile.close();
    await assertPullPaths({ appPath, relativePaths: [PULL_BASE_FILE_PATH] });
    signal.throwIfAborted();
    await rename(temporaryPath, basePath);
  } catch (error) {
    await temporaryFile?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);

    if (signal.aborted && Object.is(error, signal.reason)) {
      throw error;
    }

    throw new CliError({
      code: 'PULL_BASE_RECORD_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
