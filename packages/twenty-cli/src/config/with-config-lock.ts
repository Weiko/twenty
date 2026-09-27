import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { isNumber, isString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { CONFIG_LOCK } from '@/config/constants/config-lock.constant';
import { CliError } from '@/output/cli-error';
import { isJsonObject } from '@/utils/is-json-object';

const PRIVATE_DIRECTORY_MODE = 0o700;

const PRIVATE_FILE_MODE = 0o600;

type LockOwner = { pid: number; token: string };

const readLockOwner = async (
  lockPath: string,
): Promise<LockOwner | undefined> => {
  try {
    const owner: unknown = JSON.parse(await readFile(lockPath, 'utf8'));

    return isJsonObject(owner) && isNumber(owner.pid) && isString(owner.token)
      ? { pid: owner.pid, token: owner.token }
      : undefined;
  } catch {
    return undefined;
  }
};

const isProcessAlive = (pid: number) => {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

const createLockedError = async (lockPath: string) => {
  const owner = await readLockOwner(lockPath);
  const isOwnerGone = isDefined(owner) && !isProcessAlive(owner.pid);

  return new CliError({
    code: 'CONFIG_LOCKED',
    message: isOwnerGone
      ? `A twenty command (pid ${owner.pid}) stopped without releasing ${lockPath}.`
      : `Another twenty command${isDefined(owner) ? ` (pid ${owner.pid})` : ''} is changing ${dirname(lockPath)}.`,
    hint: isOwnerGone
      ? `Delete ${lockPath} and try again.`
      : `Try again when it finishes. If no twenty command is running, delete ${lockPath}.`,
    details: { lockPath, ownerPid: owner?.pid ?? null },
  });
};

const tryCreateLock = async (lockPath: string, token: string) => {
  try {
    const lock = await open(lockPath, 'wx', PRIVATE_FILE_MODE);

    await lock.writeFile(JSON.stringify({ pid: process.pid, token }));
    await lock.close();

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return false;
    }

    throw error;
  }
};

const acquireLock = async ({
  lockPath,
  token,
  signal,
}: {
  lockPath: string;
  token: string;
  signal: AbortSignal;
}) => {
  const deadline = Date.now() + CONFIG_LOCK.TIMEOUT_MILLISECONDS;
  let isAcquired = await tryCreateLock(lockPath, token);

  while (!isAcquired) {
    signal.throwIfAborted();

    if (Date.now() > deadline) {
      throw await createLockedError(lockPath);
    }

    await sleep(CONFIG_LOCK.RETRY_MILLISECONDS, undefined, { signal });
    isAcquired = await tryCreateLock(lockPath, token);
  }
};

const releaseLock = async (lockPath: string, token: string) => {
  const owner = await readLockOwner(lockPath);

  if (owner?.token === token) {
    await rm(lockPath, { force: true });
  }
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
  const token = randomUUID();

  await mkdir(dirname(configPath), {
    recursive: true,
    mode: PRIVATE_DIRECTORY_MODE,
  });
  await acquireLock({ lockPath, token, signal });

  try {
    return await operation();
  } finally {
    await releaseLock(lockPath, token);
  }
};
