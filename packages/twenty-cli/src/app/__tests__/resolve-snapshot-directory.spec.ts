import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveSnapshotDirectory } from '@/app/resolve-snapshot-directory';
import { type ToolingBuild } from '@/app/types/tooling-result.type';

const appPath = '/app';
const build: ToolingBuild = {
  buildId: 'build-id',
  contentHash: 'hash',
  application: {
    universalIdentifier: 'app-id',
    name: 'app',
    displayName: 'App',
  },
  manifestFormat: 'twenty-application',
  manifest: {},
  files: [],
};

describe('resolveSnapshotDirectory', () => {
  it.each([
    '.twenty/snapshots/build-sdk/files',
    '.twenty/cli/snapshots/build-cli/files',
  ])('accepts the snapshot inside %s', (path) => {
    const directory = join(appPath, path);
    expect(
      resolveSnapshotDirectory({
        build: { ...build, directory },
        appPath,
        sdkVersion: '2.44.0',
      }),
    ).toBe(directory);
  });
  it.each([
    '.twenty/cli/pull-base.json',
    '.twenty/output',
    '.twenty/cli/snapshots',
    '.twenty/snapshots',
    '.twenty/cli/snapshots-other/files',
    '.twenty/cli/snapshots/../../../outside',
    '../other/.twenty/cli/snapshots/build/files',
  ])('rejects %s outside either snapshot directory', (path) => {
    expect(() =>
      resolveSnapshotDirectory({
        build: { ...build, directory: join(appPath, path) },
        appPath,
        sdkVersion: '2.44.0',
      }),
    ).toThrow(expect.objectContaining({ code: 'SNAPSHOT_INVALID' }));
  });
});
