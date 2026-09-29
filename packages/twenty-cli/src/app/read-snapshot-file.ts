import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { type ToolingArtifact } from '@/app/types/tooling-result.type';
import { CliError } from '@/output/cli-error';
import { isInsideDirectory } from '@/utils/is-inside-directory';

const createSnapshotInvalidError = ({
  message,
  path,
}: {
  message: string;
  path: string;
}) =>
  new CliError({
    code: 'SNAPSHOT_INVALID',
    message,
    hint: 'Build again. If it keeps happening, check that nothing else writes to .twenty/snapshots.',
    details: { path },
  });

export const readSnapshotFile = async ({
  snapshotDirectory,
  artifact,
}: {
  snapshotDirectory: string;
  artifact: ToolingArtifact;
}) => {
  const filesDirectory = join(snapshotDirectory, 'files');
  const filePath = resolve(filesDirectory, artifact.path);

  if (!isInsideDirectory({ filePath, directory: filesDirectory })) {
    throw createSnapshotInvalidError({
      message: `The build lists a file outside its snapshot: ${artifact.path}`,
      path: artifact.path,
    });
  }

  const bytes = await readFile(filePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  if (bytes.length !== artifact.size || sha256 !== artifact.sha256) {
    throw createSnapshotInvalidError({
      message: `${artifact.path} changed after the build.`,
      path: artifact.path,
    });
  }

  return new Uint8Array(bytes);
};
