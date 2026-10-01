import { type ProjectSdk } from '@/app/types/project-sdk.type';

export type AppTooling =
  | ({ pipeline: 'cli' } & Pick<
      ProjectSdk,
      'version' | 'packagePath' | 'protocolVersion'
    >)
  | ({ pipeline: 'sdk' } & ProjectSdk);
