import { APP_BUILD_PROTOCOL_VERSION } from '@/app/constants/app-build-protocol.constant';
import { resolveProjectSdk } from '@/app/resolve-project-sdk';
import { resolveSourceSdk } from '@/app/resolve-source-sdk';
import { type AppOperation } from '@/app/types/app-operation.type';
import { type AppTooling } from '@/app/types/app-tooling.type';

export const resolveAppTooling = async ({
  appPath,
  operation,
  legacySdk,
}: {
  appPath: string;
  operation: AppOperation;
  legacySdk: boolean;
}): Promise<AppTooling> =>
  legacySdk
    ? { pipeline: 'sdk', ...(await resolveProjectSdk({ appPath, operation })) }
    : {
        pipeline: 'cli',
        ...(await resolveSourceSdk({ appPath })),
        protocolVersion: APP_BUILD_PROTOCOL_VERSION,
      };
