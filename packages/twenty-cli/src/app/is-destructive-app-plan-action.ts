import { type AppPlanAction } from '@/app/types/app-plan.type';

export const isDestructiveAppPlanAction = (action: AppPlanAction) =>
  action.type === 'delete' &&
  (action.metadataName === 'objectMetadata' ||
    action.metadataName === 'fieldMetadata');
