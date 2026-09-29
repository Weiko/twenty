import { join } from 'node:path';

import { isDefined } from 'twenty-shared/utils';

import { type ToolingBuild } from '@/app/types/tooling-result.type';
import { CliError } from '@/output/cli-error';
import { isInsideDirectory } from '@/utils/is-inside-directory';

export const resolveSnapshotDirectory = ({
  build,
  appPath,
  sdkVersion,
}: {
  build: ToolingBuild;
  appPath: string;
  sdkVersion: string;
}) => {
  if (!isDefined(build.directory)) {
    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message: `twenty-sdk ${sdkVersion} did not report where its build snapshot is, so the CLI cannot upload it.`,
      hint: 'Upgrade twenty-sdk in this app, then install its dependencies again.',
    });
  }

  if (
    !isInsideDirectory({
      filePath: build.directory,
      directory: join(appPath, '.twenty', 'snapshots'),
    })
  ) {
    throw new CliError({
      code: 'SNAPSHOT_INVALID',
      message: `The build snapshot ${build.directory} is outside the app's .twenty/snapshots folder.`,
      details: { directory: build.directory },
    });
  }

  return build.directory;
};
