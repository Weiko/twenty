import { isDefined } from 'twenty-shared/utils';

import { COMMAND_CATALOG } from '@/catalog/command-catalog';
import { getCommandName } from '@/catalog/get-command-name';
import { LEGACY_COMMAND_REPLACEMENTS } from '@/legacy/constants/legacy-command-replacements.constant';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';

const isAvailable = (replacement: string) =>
  COMMAND_CATALOG.some((definition) => {
    const commandName = getCommandName(definition);

    return (
      commandName === replacement || commandName.startsWith(`${replacement} `)
    );
  });

const findReplacement = (legacyCommand: string) => {
  if (Object.hasOwn(LEGACY_COMMAND_REPLACEMENTS, legacyCommand)) {
    return {
      isKnownLegacyCommand: true,
      replacement: LEGACY_COMMAND_REPLACEMENTS[legacyCommand],
    };
  }

  return {
    isKnownLegacyCommand: false,
    replacement: legacyCommand.includes(':')
      ? legacyCommand.replaceAll(':', ' ')
      : null,
  };
};

export const createLegacyCommandError = ({
  legacyCommand,
  remainingArguments,
}: {
  legacyCommand: string;
  remainingArguments: string[];
}) => {
  const { isKnownLegacyCommand, replacement } = findReplacement(legacyCommand);
  const isReplacementAvailable =
    isDefined(replacement) && isAvailable(replacement);

  if (isReplacementAvailable) {
    return new CliError({
      code: 'USAGE',
      exitCode: EXIT_CODE.USAGE,
      message: `twenty ${legacyCommand} is the old twenty-sdk spelling.`,
      hint: `Use: twenty ${[replacement, ...remainingArguments].join(' ')}`,
      details: {
        legacyCommand,
        replacement,
        replacementAvailable: isReplacementAvailable,
      },
    });
  }

  if (!isKnownLegacyCommand) {
    return undefined;
  }

  return new CliError({
    code: 'USAGE',
    exitCode: EXIT_CODE.USAGE,
    message: isDefined(replacement)
      ? `twenty ${legacyCommand} is a twenty-sdk command. Its replacement, twenty ${replacement}, is not available yet.`
      : `twenty ${legacyCommand} is a twenty-sdk command with no equivalent here yet.`,
    hint: `In your app project, keep using: yarn twenty ${[legacyCommand, ...remainingArguments].join(' ')}`,
    details: {
      legacyCommand,
      replacement,
      replacementAvailable: isReplacementAvailable,
    },
  });
};
