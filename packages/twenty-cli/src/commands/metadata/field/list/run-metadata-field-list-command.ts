import {
  readBooleanOption,
  readStringArgument,
} from '@/catalog/read-command-values';
import { type CommandRun } from '@/catalog/types/command-run.type';
import { type TargetCommandContext } from '@/catalog/types/target-command-context.type';
import { fetchMetadataInspection } from '@/metadata/fetch-metadata-inspection';
import { formatMetadataFields } from '@/metadata/format-metadata-fields';

export const runMetadataFieldListCommand: CommandRun<
  TargetCommandContext
> = async ({
  arguments: commandArguments,
  options,
  target,
  signal,
  output,
}) => {
  const { object, fields: allFields } = await fetchMetadataInspection({
    objectName: readStringArgument(commandArguments, 0) ?? '',
    target,
    signal,
    output,
  });
  const fields = allFields.filter(
    (field) => readBooleanOption(options, 'all') || field.isSystem !== true,
  );
  const hiddenSystemFieldCount = allFields.length - fields.length;

  return {
    data: { object, fields, hiddenSystemFieldCount },
    human: `${object.labelPlural} (${object.namePlural})\n\n${formatMetadataFields({ fields, hiddenSystemFieldCount, labelIdentifierFieldMetadataId: object.labelIdentifierFieldMetadataId })}`,
  };
};
