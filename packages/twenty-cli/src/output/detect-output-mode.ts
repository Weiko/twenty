import { isDefined } from 'twenty-shared/utils';

import { type OutputMode } from '@/output/types/output-mode.type';

const FORMAT_FLAG = '--format';

const findFormatValue = (args: string[]) => {
  const inlineFormat = args.find((argument) =>
    argument.startsWith(`${FORMAT_FLAG}=`),
  );

  if (isDefined(inlineFormat)) {
    return inlineFormat.slice(FORMAT_FLAG.length + 1);
  }

  const formatFlagIndex = args.indexOf(FORMAT_FLAG);

  return formatFlagIndex === -1 ? undefined : args[formatFlagIndex + 1];
};

export const detectOutputMode = (args: string[]): OutputMode => {
  const endOfOptionsIndex = args.indexOf('--');
  const optionArguments =
    endOfOptionsIndex === -1 ? args : args.slice(0, endOfOptionsIndex);
  const formatValue = findFormatValue(optionArguments);

  if (optionArguments.includes('--json') || formatValue === 'json') {
    return 'json';
  }

  if (formatValue === 'ndjson') {
    return 'ndjson';
  }

  return 'human';
};
