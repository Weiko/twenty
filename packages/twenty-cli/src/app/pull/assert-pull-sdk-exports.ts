import { createRequire } from 'node:module';
import { join } from 'node:path';
import { isDefined } from 'twenty-shared/utils';

import { type PullWrite } from '@/app/pull/plan-pull-writes';
import { CliError } from '@/output/cli-error';

export const assertPullSdkExports = ({
  appPath,
  writes,
}: {
  appPath: string;
  writes: PullWrite[];
}) => {
  const requiredNames = new Set(
    writes
      .filter((write) => write.kind !== 'translation')
      .flatMap(
        (write) =>
          write.content
            .match(/^import \{([\s\S]*?)\} from 'twenty-sdk\/define';/)?.[1]
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean) ?? [],
      ),
  );

  if (requiredNames.size === 0) {
    return;
  }

  const defineExports: Record<string, unknown> = createRequire(
    join(appPath, 'package.json'),
  )('twenty-sdk/define');

  const missingNames = [...requiredNames]
    .filter((name) => !isDefined(defineExports[name]))
    .sort();

  if (missingNames.length > 0) {
    throw new CliError({
      code: 'SDK_SOURCE_UNSUPPORTED',
      message: `The app's twenty-sdk cannot read the generated definitions. Missing exports: ${missingNames.join(', ')}.`,
      hint: 'Upgrade the app to a compatible twenty-sdk version (2.40.0 or later).',
      details: { missingNames },
    });
  }
};
