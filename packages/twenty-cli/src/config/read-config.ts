import { readFile } from 'node:fs/promises';
import { isDefined } from 'twenty-shared/utils';

import { normalizeConfig } from '@/config/normalize-config';
import { type ConfigFile } from '@/config/types/config-file.type';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';

const EMPTY_CONFIG: ConfigFile = { version: 1, remotes: {} };

const createInvalidConfigError = (configPath: string, reason: string) =>
  new CliError({
    code: 'INVALID_CONFIG',
    exitCode: EXIT_CODE.USAGE,
    message: `${configPath} is not a valid Twenty config: ${reason}`,
    hint: 'Fix or move the file. It is never overwritten while it is invalid.',
    details: { configPath },
  });

const readConfigText = async (configPath: string) => {
  try {
    return await readFile(configPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }

    throw new CliError({
      code: 'INVALID_CONFIG',
      exitCode: EXIT_CODE.USAGE,
      message: `Could not read ${configPath}.`,
      details: {
        configPath,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  }
};

export const readConfig = async (configPath: string): Promise<ConfigFile> => {
  const text = await readConfigText(configPath);

  if (text.trim() === '') {
    return EMPTY_CONFIG;
  }

  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw createInvalidConfigError(
      configPath,
      error instanceof Error ? error.message : String(error),
    );
  }

  const config = normalizeConfig(raw);

  if (!isDefined(config)) {
    throw createInvalidConfigError(
      configPath,
      'remotes need an apiUrl and defaultRemote must be a name.',
    );
  }

  return config;
};
