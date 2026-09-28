import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ConfigFile } from '@/config/types/config-file.type';
import { updateConfig } from '@/config/update-config';

vi.mock('@/config/constants/config-lock.constant', () => ({
  CONFIG_LOCK: { TIMEOUT_MILLISECONDS: 500, RETRY_MILLISECONDS: 10 },
}));

const INITIAL_CONFIG: ConfigFile = {
  version: 1,
  remotes: { dev: { apiUrl: 'http://localhost:3000' } },
};

const addRemote = (config: ConfigFile, name: string) => ({
  result: name,
  config: {
    ...config,
    remotes: { ...config.remotes, [name]: { apiUrl: `https://${name}.dev` } },
  },
});

describe('updateConfig', () => {
  let configPath: string;

  const readConfigFile = async (): Promise<ConfigFile> =>
    JSON.parse(await readFile(configPath, 'utf8'));

  beforeEach(async () => {
    const directory = await mkdtemp(join(tmpdir(), 'twenty-cli-update-'));

    configPath = join(directory, '.twenty', 'config.json');
  });

  it('creates a private config directory and file', async () => {
    await updateConfig({
      configPath,
      signal: new AbortController().signal,
      update: (config) => addRemote(config, 'first'),
    });

    expect((await stat(dirname(configPath))).mode & 0o777).toBe(0o700);
    expect((await stat(configPath)).mode & 0o777).toBe(0o600);
    expect(Object.keys((await readConfigFile()).remotes)).toEqual(['first']);
  });

  it('keeps every write when updates run concurrently', async () => {
    const names = Array.from({ length: 20 }, (_, index) => `remote-${index}`);

    await Promise.all(
      names.map((name) =>
        updateConfig({
          configPath,
          signal: new AbortController().signal,
          update: (config) => addRemote(config, name),
        }),
      ),
    );

    expect(Object.keys((await readConfigFile()).remotes).sort()).toEqual(
      [...names].sort(),
    );
  });

  it('never overwrites an invalid config', async () => {
    await updateConfig({
      configPath,
      signal: new AbortController().signal,
      update: (config) => addRemote(config, 'first'),
    });
    await writeFile(configPath, '{ broken');

    await expect(
      updateConfig({
        configPath,
        signal: new AbortController().signal,
        update: (config) => addRemote(config, 'second'),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    expect(await readFile(configPath, 'utf8')).toBe('{ broken');
  });

  it('waits for a lock held by a running command, then says who holds it', async () => {
    await updateConfig({
      configPath,
      signal: new AbortController().signal,
      update: () => ({ result: null, config: INITIAL_CONFIG }),
    });

    const heldLock = JSON.stringify({ pid: process.pid, token: 'held' });

    await writeFile(`${configPath}.lock`, heldLock);

    await expect(
      updateConfig({
        configPath,
        signal: new AbortController().signal,
        update: (config) => addRemote(config, 'blocked'),
      }),
    ).rejects.toMatchObject({
      code: 'CONFIG_LOCKED',
      details: { ownerPid: process.pid },
    });
    expect(await readFile(`${configPath}.lock`, 'utf8')).toBe(heldLock);
    expect(Object.keys((await readConfigFile()).remotes)).toEqual(['dev']);
  });

  it('never breaks a lock left by an exited command, and explains how to recover', async () => {
    await updateConfig({
      configPath,
      signal: new AbortController().signal,
      update: () => ({ result: null, config: INITIAL_CONFIG }),
    });

    const exitedProcess = spawnSync(process.execPath, ['-e', 'process.pid']);
    const abandonedLock = JSON.stringify({
      pid: exitedProcess.pid,
      token: 'abandoned',
    });

    await writeFile(`${configPath}.lock`, abandonedLock);

    await expect(
      updateConfig({
        configPath,
        signal: new AbortController().signal,
        update: (config) => addRemote(config, 'after-crash'),
      }),
    ).rejects.toMatchObject({
      code: 'CONFIG_LOCKED',
      hint: `Delete ${configPath}.lock and try again.`,
    });
    expect(await readFile(`${configPath}.lock`, 'utf8')).toBe(abandonedLock);
  });

  it('stops waiting for the lock when the command is cancelled', async () => {
    await updateConfig({
      configPath,
      signal: new AbortController().signal,
      update: () => ({ result: null, config: INITIAL_CONFIG }),
    });
    await writeFile(
      `${configPath}.lock`,
      JSON.stringify({ pid: process.pid, token: 'held' }),
    );

    const abortController = new AbortController();

    setTimeout(() => abortController.abort(), 50);

    await expect(
      updateConfig({
        configPath,
        signal: abortController.signal,
        update: (config) => addRemote(config, 'cancelled'),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(Object.keys((await readConfigFile()).remotes)).toEqual(['dev']);
  });
});
