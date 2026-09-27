import { isNonEmptyString } from '@sniptt/guards';

import { readConfig } from '@/config/read-config';
import { type RemoteEntry } from '@/config/types/config-file.type';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';
import { type CliWarning } from '@/output/types/cli-warning.type';
import { TARGET_ENVIRONMENT_VARIABLE } from '@/target/constants/target-environment-variable.constant';
import { parseApiUrl } from '@/target/parse-api-url';
import { selectTarget } from '@/target/select-target';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';

const toRemoteTarget = (
  remoteName: string,
  remote: RemoteEntry,
): ResolvedTarget => {
  const accessToken = remote.twentyCLIAccessToken;
  const bearerToken = isNonEmptyString(accessToken)
    ? accessToken
    : remote.apiKey;

  if (!isNonEmptyString(bearerToken)) {
    throw new CliError({
      code: 'AUTH_REQUIRED',
      exitCode: EXIT_CODE.AUTHENTICATION,
      message: `Remote ${remoteName} has no saved credentials.`,
      hint: `Sign in: twenty auth login --remote ${remoteName} --with-token`,
      details: { remote: remoteName },
    });
  }

  return {
    apiUrl: parseApiUrl({
      rawUrl: remote.apiUrl,
      sourceName: `The URL of remote ${remoteName}`,
    }),
    bearerToken,
    credentialKind: isNonEmptyString(accessToken) ? 'oauth' : 'apiKey',
    source: 'remote',
    remoteName,
  };
};

export const resolveTarget = async ({
  environment,
  remoteFlag,
  configPath,
  warn,
}: {
  environment: NodeJS.ProcessEnv;
  remoteFlag: string | undefined;
  configPath: string;
  warn: (warning: CliWarning) => void;
}): Promise<ResolvedTarget> => {
  const selection = await selectTarget({
    environment,
    remoteFlag,
    loadConfig: () => readConfig(configPath),
    warn,
  });

  if (selection.source === 'remote') {
    return toRemoteTarget(selection.remoteName, selection.remote);
  }

  return {
    apiUrl: parseApiUrl({
      rawUrl: selection.apiUrl,
      sourceName: TARGET_ENVIRONMENT_VARIABLE.API_URL,
    }),
    bearerToken: selection.apiKey,
    credentialKind: 'apiKey',
    source: 'environment',
  };
};
