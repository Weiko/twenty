import { isDefined } from 'twenty-shared/utils';

import { formatMetadataOwner } from '@/metadata/format-metadata-owner';
import { type InspectedField } from '@/metadata/types/metadata-inspection.type';
import { formatTable } from '@/output/format-table';
import { dimText } from '@/output/style';
import { isJsonObject } from '@/utils/is-json-object';

export const formatMetadataRelations = (field: InspectedField) => {
  const relations = isDefined(field.relation)
    ? [field.relation]
    : (field.morphRelations ?? []).filter(
        (relation) => relation.sourceFieldMetadata.id === field.id,
      );

  return relations
    .map(
      (relation) =>
        `${relation.type.toLowerCase().replaceAll('_', '-')} · ${relation.targetObjectMetadata.namePlural}.${relation.targetFieldMetadata.name}`,
    )
    .join(' · ');
};

const formatMetadataFieldDetails = (field: InspectedField) => {
  const options: unknown = field.options;

  return [
    field.isActive === false ? 'inactive' : '',
    field.isNullable === false ? 'required' : '',
    field.isUnique === true ? 'unique' : '',
    formatMetadataRelations(field),
    ...(Array.isArray(options)
      ? options
          .filter(isJsonObject)
          .map((option) => String(option.label ?? option.value ?? ''))
      : []),
  ]
    .filter(Boolean)
    .join(' · ');
};

export const formatMetadataFields = ({
  fields,
  hiddenSystemFieldCount,
  labelIdentifierFieldMetadataId,
}: {
  fields: InspectedField[];
  hiddenSystemFieldCount: number;
  labelIdentifierFieldMetadataId?: string;
}) =>
  [
    formatTable({
      rows: fields,
      columns: [
        { header: 'FIELD', value: (field) => field.name },
        { header: 'LABEL', value: (field) => field.label },
        { header: 'TYPE', value: (field) => field.type },
        { header: 'OWNER', value: (field) => formatMetadataOwner(field.owner) },
        {
          header: 'DETAILS',
          value: (field) =>
            [
              field.id === labelIdentifierFieldMetadataId ? 'label field' : '',
              formatMetadataFieldDetails(field),
            ]
              .filter(Boolean)
              .join(' · '),
        },
      ],
    }),
    dimText(
      hiddenSystemFieldCount > 0
        ? `${fields.length} fields · ${hiddenSystemFieldCount} system fields hidden, show them with --all`
        : `${fields.length} fields`,
    ),
  ].join('\n');
