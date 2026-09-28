import { isNonEmptyString } from '@sniptt/guards';

import {
  readBooleanOption,
  readStringArgument,
} from '@/catalog/read-command-values';
import { type CommandRun } from '@/catalog/types/command-run.type';
import { type TargetCommandContext } from '@/catalog/types/target-command-context.type';
import { fetchMetadataInspection } from '@/metadata/fetch-metadata-inspection';
import { formatMetadataFields } from '@/metadata/format-metadata-fields';
import { formatMetadataOwner } from '@/metadata/format-metadata-owner';
import { selectListedFields } from '@/metadata/select-listed-fields';
import { formatDetails } from '@/output/format-details';

export const runMetadataObjectDescribeCommand: CommandRun<
  TargetCommandContext
> = async ({
  arguments: commandArguments,
  options,
  target,
  signal,
  output,
}) => {
  const inspection = await fetchMetadataInspection({
    objectName: readStringArgument(commandArguments, 0) ?? '',
    target,
    signal,
    output,
  });
  const { object } = inspection;
  const { fields, hiddenSystemFieldCount } = selectListedFields({
    fields: inspection.fields,
    includeSystemFields: readBooleanOption(options, 'all'),
  });

  return {
    data: { object, fields, hiddenSystemFieldCount },
    human: [
      `${object.labelPlural} (${object.namePlural})`,
      formatDetails([
        ['ID', object.id],
        ['API names', `${object.nameSingular} / ${object.namePlural}`],
        ['Owner', formatMetadataOwner(object.owner)],
        ['Active', String(object.isActive)],
        ['System', String(object.isSystem)],
        ['Searchable', String(object.isSearchable)],
      ]),
      object.description ?? '',
      formatMetadataFields({
        fields,
        hiddenSystemFieldCount,
        labelIdentifierFieldMetadataId: object.labelIdentifierFieldMetadataId,
      }),
    ]
      .filter(isNonEmptyString)
      .join('\n\n'),
  };
};
