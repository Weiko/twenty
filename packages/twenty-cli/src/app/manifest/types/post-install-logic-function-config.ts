import { type PreInstallLogicFunctionConfig } from '@/app/manifest/types/pre-install-logic-function-config';

export type PostInstallLogicFunctionConfig = PreInstallLogicFunctionConfig & {
  shouldRunSynchronously?: boolean;
};
