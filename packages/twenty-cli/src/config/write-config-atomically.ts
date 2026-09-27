import { randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';

import { type ConfigFile } from '@/config/types/config-file.type';

const PRIVATE_FILE_MODE = 0o600;

export const writeConfigAtomically = async (
  configPath: string,
  config: ConfigFile,
) => {
  const temporaryPath = `${configPath}.${process.pid}.${randomUUID()}.tmp`;
  const temporaryFile = await open(temporaryPath, 'wx', PRIVATE_FILE_MODE);

  try {
    await temporaryFile.writeFile(`${JSON.stringify(config, null, 2)}\n`);
    await temporaryFile.sync();
    await temporaryFile.close();
    await rename(temporaryPath, configPath);
  } catch (error) {
    await temporaryFile.close().catch(() => undefined);
    await rm(temporaryPath, { force: true });

    throw error;
  }
};
