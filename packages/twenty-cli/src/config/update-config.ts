import { readConfig } from '@/config/read-config';
import { type ConfigFile } from '@/config/types/config-file.type';
import { withConfigLock } from '@/config/with-config-lock';
import { writeConfigAtomically } from '@/config/write-config-atomically';

export const updateConfig = <TResult>(
  configPath: string,
  update: (config: ConfigFile) => { config: ConfigFile; result: TResult },
) =>
  withConfigLock(configPath, async () => {
    const { config, result } = update(await readConfig(configPath));

    await writeConfigAtomically(configPath, config);

    return result;
  });
