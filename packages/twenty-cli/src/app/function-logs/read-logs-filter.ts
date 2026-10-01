import { isDefined, isValidUuid } from 'twenty-shared/utils';

import { readStringOption } from '@/catalog/read-command-values';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';

export const readLogsFilter = (options: Record<string, unknown>) => {
  const name = readStringOption(options, 'name');
  const universalIdentifier = readStringOption(options, 'universalIdentifier');

  if (
    (isDefined(name) && isDefined(universalIdentifier)) ||
    (isDefined(name) && name.trim().length === 0) ||
    (isDefined(universalIdentifier) && !isValidUuid(universalIdentifier))
  ) {
    throw new CliError({
      code: 'INVALID_INPUT',
      exitCode: EXIT_CODE.USAGE,
      message:
        'Use either a nonempty --name or a UUID --universal-identifier, or neither to watch every function in the app.',
    });
  }

  return {
    ...(isDefined(name) ? { name } : {}),
    ...(isDefined(universalIdentifier)
      ? { universalIdentifier: universalIdentifier.toLowerCase() }
      : {}),
  };
};
