import { TARGET_ENVIRONMENT_VARIABLE } from '@/target/constants/target-environment-variable.constant';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { type TargetSource } from '@/target/types/target-source.type';

const AUTHENTICATION_HINTS: Record<TargetSource, string> = {
  environment: `Check ${TARGET_ENVIRONMENT_VARIABLE.API_KEY}.`,
};

export const getAuthenticationHint = (target: ResolvedTarget) =>
  AUTHENTICATION_HINTS[target.source];
