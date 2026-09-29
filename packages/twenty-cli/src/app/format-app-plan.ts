import { isNonEmptyString } from '@sniptt/guards';

import {
  type AppPlanAction,
  type AppPlanSummary,
} from '@/app/types/app-plan.type';
import { formatDataCell, formatDataValue } from '@/data/format-data-value';
import { formatTable } from '@/output/format-table';

const getActionName = (action: AppPlanAction) =>
  [
    action.flatEntity?.name,
    action.flatEntity?.nameSingular,
    action.flatEntity?.universalIdentifier,
    action.universalIdentifier,
  ].find(isNonEmptyString) ?? '(unnamed)';

export const formatAppPlanActions = ({
  actions,
  summary,
  inferDeletionFromMissingEntities,
}: {
  actions: AppPlanAction[];
  summary: AppPlanSummary;
  inferDeletionFromMissingEntities: boolean;
}) => {
  const destructiveLabel =
    summary.destructive === 1
      ? 'object or field deletion'
      : 'object or field deletions';

  return [
    actions.length === 0
      ? 'No changes. Twenty metadata matches your manifest.'
      : formatTable({
          rows: actions,
          columns: [
            { header: 'ACTION', value: (action) => action.type },
            {
              header: 'METADATA',
              value: (action) => formatDataCell(action.metadataName),
            },
            {
              header: 'ENTITY',
              value: (action) => formatDataCell(getActionName(action)),
            },
            {
              header: 'CHANGED FIELDS',
              value: (action) =>
                formatDataCell(Object.keys(action.diff ?? {}).join(', ')),
            },
          ],
        }),
    `${summary.create} to add, ${summary.update} to change, ${summary.delete} to delete.`,
    summary.destructive > 0
      ? `${summary.destructive} ${destructiveLabel} would permanently delete stored data.`
      : '',
    inferDeletionFromMissingEntities && summary.delete > 0
      ? 'Entities missing from source are deleted by default. Use --no-delete to keep them.'
      : '',
  ]
    .filter(isNonEmptyString)
    .join('\n\n');
};

export const formatAppPlan = ({
  applicationName,
  apiUrl,
  actions,
  summary,
  inferDeletionFromMissingEntities,
}: {
  applicationName: string;
  apiUrl: string;
  actions: AppPlanAction[];
  summary: AppPlanSummary;
  inferDeletionFromMissingEntities: boolean;
}) =>
  [
    `Advisory plan for ${formatDataValue(applicationName)} on ${apiUrl}`,
    formatAppPlanActions({
      actions,
      summary,
      inferDeletionFromMissingEntities,
    }),
    'Use --json for complete action details.',
    'Nothing was registered, uploaded or synchronized. The server may return different actions when you apply.',
  ].join('\n\n');
