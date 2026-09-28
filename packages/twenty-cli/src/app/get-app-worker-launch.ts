import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const getAppWorkerLaunch = () => ({
  modulePath: join(
    dirname(realpathSync(process.argv[1] ?? '')),
    'app-worker.cjs',
  ),
  execArgv: [] as string[],
});
