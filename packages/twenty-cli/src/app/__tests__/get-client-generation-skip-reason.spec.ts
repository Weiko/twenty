import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getClientGenerationSkipReason } from '@/app/get-client-generation-skip-reason';
import { type AppTooling } from '@/app/types/app-tooling.type';

const createSdk = (capabilities: string[]): AppTooling => ({
  pipeline: 'sdk',
  version: '9.9.9',
  packagePath: '/sdk',
  buildEntryPath: '/sdk/build.cjs',
  protocolVersion: 1,
  capabilities,
});

const GENERATING_SDK = createSdk([
  'build',
  'releaseSnapshot',
  'generateClient',
]);

describe('getClientGenerationSkipReason', () => {
  let appPath: string;

  beforeEach(async () => {
    appPath = await mkdtemp(join(tmpdir(), 'twenty-cli-client-skip-'));
  });

  afterEach(() => rm(appPath, { recursive: true, force: true }));

  it('skips an SDK that does not advertise client generation', async () => {
    await mkdir(join(appPath, 'node_modules', 'twenty-client-sdk'), {
      recursive: true,
    });

    expect(
      await getClientGenerationSkipReason({
        appPath,
        sdk: createSdk(['build', 'releaseSnapshot']),
      }),
    ).toBe(
      'twenty-sdk 9.9.9 cannot generate it. Upgrade twenty-sdk in this app to regenerate the client on apply.',
    );
  });

  it('skips an app without its own client package', async () => {
    expect(
      await getClientGenerationSkipReason({ appPath, sdk: GENERATING_SDK }),
    ).toBe("twenty-client-sdk is not installed in the app's own node_modules.");
  });

  it('generates into an installed client package', async () => {
    await mkdir(join(appPath, 'node_modules', 'twenty-client-sdk'), {
      recursive: true,
    });

    expect(
      await getClientGenerationSkipReason({ appPath, sdk: GENERATING_SDK }),
    ).toBeUndefined();
  });

  it('leaves a dangling client package link to the SDK', async () => {
    await mkdir(join(appPath, 'node_modules'));
    await symlink(
      join(appPath, 'missing'),
      join(appPath, 'node_modules', 'twenty-client-sdk'),
    );

    expect(
      await getClientGenerationSkipReason({ appPath, sdk: GENERATING_SDK }),
    ).toBeUndefined();
  });

  it('leaves an unreadable client package path to the SDK', async () => {
    await writeFile(join(appPath, 'node_modules'), 'not a directory');

    expect(
      await getClientGenerationSkipReason({ appPath, sdk: GENERATING_SDK }),
    ).toBeUndefined();
  });
});
