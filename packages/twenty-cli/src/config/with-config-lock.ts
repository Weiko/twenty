import { mkdir, open, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { isDefined } from 'twenty-shared/utils';

import { CONFIG_LOCK } from '@/config/constants/config-lock.constant';
import { CliError } from '@/output/cli-error';

const PRIVATE_DIRECTORY_MODE = 0o700;

const PRIVATE_FILE_MODE = 0o600;

const tryCreateLock = async (lockPath: string) => {
  try {
    const lock = await open(lockPath, 'wx', PRIVATE_FILE_MODE);

    await lock.writeFile(
      JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
    );

    return lock;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return undefined;
    }

    throw error;
  }
};

const removeStaleLock = async (lockPath: string) => {
  const lockStats = await stat(lockPath).catch(() => undefined);

  if (
    isDefined(lockStats) &&
    Date.now() - lockStats.mtimeMs > CONFIG_LOCK.STALE_AFTER_MILLISECONDS
  ) {
    await rm(lockPath, { force: true });
  }
};

const acquireLock = async (lockPath: string, signal: AbortSignal) => {
  const deadline = Date.now() + CONFIG_LOCK.TIMEOUT_MILLISECONDS;
  let lock = await tryCreateLock(lockPath);

  while (!isDefined(lock)) {
    signal.throwIfAborted();

    if (Date.now() > deadline) {
      throw new CliError({
        code: 'CONFIG_LOCKED',
        message: `Another twenty command is changing ${dirname(lockPath)}.`,
        hint: `Try again. If no other command is running, delete ${lockPath}.`,
        details: { lockPath },
      });
    }

    await removeStaleLock(lockPath);
    await sleep(CONFIG_LOCK.RETRY_MILLISECONDS, undefined, { signal });
    lock = await tryCreateLock(lockPath);
  }

  return lock;
};

export const withConfigLock = async <TResult>({
  configPath,
  signal,
  operation,
}: {
  configPath: string;
  signal: AbortSignal;
  operation: () => Promise<TResult>;
}) => {
  const lockPath = `${configPath}.lock`;

  await mkdir(dirname(configPath), {
    recursive: true,
    mode: PRIVATE_DIRECTORY_MODE,
  });

  const lock = await acquireLock(lockPath, signal);

  try {
    return await operation();
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
};
