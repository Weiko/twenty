import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';
import { TARGET_ENVIRONMENT_VARIABLE } from '@/target/constants/target-environment-variable.constant';
import { parseApiUrl } from '@/target/parse-api-url';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';

const readEnvironmentValue = (
  environment: NodeJS.ProcessEnv,
  variableName: string,
) => {
  const value = environment[variableName]?.trim();

  return isNonEmptyString(value) ? value : undefined;
};

export const resolveTarget = ({
  environment,
}: {
  environment: NodeJS.ProcessEnv;
}): ResolvedTarget => {
  const remoteName = readEnvironmentValue(
    environment,
    TARGET_ENVIRONMENT_VARIABLE.REMOTE,
  );
  const apiUrl = readEnvironmentValue(
    environment,
    TARGET_ENVIRONMENT_VARIABLE.API_URL,
  );
  const apiKey = readEnvironmentValue(
    environment,
    TARGET_ENVIRONMENT_VARIABLE.API_KEY,
  );

  if (isDefined(remoteName) && (isDefined(apiUrl) || isDefined(apiKey))) {
    throw new CliError({
      code: 'CONFLICTING_TARGET',
      exitCode: EXIT_CODE.USAGE,
      message: `${TARGET_ENVIRONMENT_VARIABLE.REMOTE} cannot be combined with ${TARGET_ENVIRONMENT_VARIABLE.API_URL} or ${TARGET_ENVIRONMENT_VARIABLE.API_KEY}.`,
      hint: 'Unset one of them.',
    });
  }

  if (isDefined(remoteName)) {
    throw new CliError({
      code: 'TARGET_REQUIRED',
      exitCode: EXIT_CODE.USAGE,
      message: `${TARGET_ENVIRONMENT_VARIABLE.REMOTE} is set, but saved remotes are not available yet.`,
      hint: `Set ${TARGET_ENVIRONMENT_VARIABLE.API_URL} and ${TARGET_ENVIRONMENT_VARIABLE.API_KEY} instead.`,
    });
  }

  if (isDefined(apiUrl) !== isDefined(apiKey)) {
    const missingVariable = isDefined(apiUrl)
      ? TARGET_ENVIRONMENT_VARIABLE.API_KEY
      : TARGET_ENVIRONMENT_VARIABLE.API_URL;

    throw new CliError({
      code: 'INCOMPLETE_TARGET',
      exitCode: EXIT_CODE.USAGE,
      message: `${missingVariable} is not set.`,
      hint: `Set both ${TARGET_ENVIRONMENT_VARIABLE.API_URL} and ${TARGET_ENVIRONMENT_VARIABLE.API_KEY}, or neither.`,
    });
  }

  if (isDefined(apiUrl) && isDefined(apiKey)) {
    return {
      apiUrl: parseApiUrl({
        rawUrl: apiUrl,
        sourceName: TARGET_ENVIRONMENT_VARIABLE.API_URL,
      }),
      bearerToken: apiKey,
      source: 'environment',
    };
  }

  throw new CliError({
    code: 'TARGET_REQUIRED',
    exitCode: EXIT_CODE.USAGE,
    message: 'No workspace selected.',
    hint: `Set ${TARGET_ENVIRONMENT_VARIABLE.API_URL} and ${TARGET_ENVIRONMENT_VARIABLE.API_KEY}.`,
  });
};
