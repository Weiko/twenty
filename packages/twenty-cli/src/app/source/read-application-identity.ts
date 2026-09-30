import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';

import { isString } from '@sniptt/guards';
import { glob } from 'tinyglobby';
import { isDefined, isValidUuid } from 'twenty-shared/utils';

import {
  APPLICATION_SOURCE_GLOBS,
  APPLICATION_SOURCE_IGNORED_GLOBS,
} from '@/app/source/application-source-globs';
import { extractDefineEntity } from '@/app/source/extract-define-entity';
import { extractManifestFromFile } from '@/app/source/extract-manifest-from-file';
import { type AppSourceIdentity } from '@/app/source/types/app-source-identity.type';

export const readApplicationIdentity = async ({
  appPath,
  signal,
}: {
  appPath: string;
  signal: AbortSignal;
}): Promise<AppSourceIdentity> => {
  signal.throwIfAborted();

  if (!isAbsolute(appPath) || !(await stat(appPath)).isDirectory()) {
    throw new Error('The app path must be an absolute directory path.');
  }

  const filePaths = await glob(APPLICATION_SOURCE_GLOBS, {
    cwd: appPath,
    absolute: true,
    ignore: APPLICATION_SOURCE_IGNORED_GLOBS,
    onlyFiles: true,
  });
  let application: AppSourceIdentity['application'] = null;

  for (const filePath of filePaths) {
    signal.throwIfAborted();

    if (
      extractDefineEntity(await readFile(filePath, 'utf8')) !==
      'defineApplication'
    ) {
      continue;
    }

    if (isDefined(application)) {
      throw new Error('The project declares more than one application.');
    }

    const { config } = await extractManifestFromFile({ appPath, filePath });

    if (
      !isString(config.universalIdentifier) ||
      !isValidUuid(config.universalIdentifier)
    ) {
      throw new Error(
        `Could not read the application identifier in ${relative(appPath, filePath)}.`,
      );
    }

    application = {
      universalIdentifier: config.universalIdentifier,
      displayName: isString(config.displayName) ? config.displayName : null,
    };
  }

  signal.throwIfAborted();

  return { application };
};
