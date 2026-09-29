import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

import { type ProjectSdk } from '@/app/types/project-sdk.type';
import { hasErrorCode } from '@/utils/has-error-code';

export const getClientGenerationSkipReason = async ({
  appPath,
  sdk,
}: {
  appPath: string;
  sdk: ProjectSdk;
}) => {
  if (!sdk.capabilities.includes('generateClient')) {
    return `twenty-sdk ${sdk.version} cannot generate it. Upgrade twenty-sdk in this app to regenerate the client on apply.`;
  }

  const isClientPackageMissing = await lstat(
    join(appPath, 'node_modules', 'twenty-client-sdk'),
  ).then(
    () => false,
    (error: unknown) => hasErrorCode(error, 'ENOENT'),
  );

  if (isClientPackageMissing) {
    return "twenty-client-sdk is not installed in the app's own node_modules.";
  }

  return undefined;
};
