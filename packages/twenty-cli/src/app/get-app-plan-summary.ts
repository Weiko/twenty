import {
  type AppPlanAction,
  type AppPlanSummary,
} from '@/app/types/app-plan.type';

export const getAppPlanSummary = (actions: AppPlanAction[]): AppPlanSummary => {
  const summary = { create: 0, update: 0, delete: 0, destructive: 0 };

  for (const action of actions) {
    summary[action.type] += 1;

    if (
      action.type === 'delete' &&
      (action.metadataName === 'objectMetadata' ||
        action.metadataName === 'fieldMetadata')
    ) {
      summary.destructive += 1;
    }
  }

  return summary;
};
