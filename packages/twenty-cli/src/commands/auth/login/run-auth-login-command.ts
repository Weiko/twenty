import { isDefined } from 'twenty-shared/utils';

import {
  readBooleanOption,
  readStringOption,
} from '@/catalog/read-command-values';
import { type CommandRun } from '@/catalog/types/command-run.type';
import { readApiKeyFromStandardInput } from '@/commands/auth/login/read-api-key-from-standard-input';
import { getConfigPath } from '@/config/get-config-path';
import { readConfig } from '@/config/read-config';
import {
  type ConfigFile,
  type RemoteEntry,
} from '@/config/types/config-file.type';
import { updateConfig } from '@/config/update-config';
import { validateRemoteName } from '@/config/validate-remote-name';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';
import { dimText, formatSuccessLine } from '@/output/style';
import { parseApiUrl } from '@/target/parse-api-url';
import { fetchWorkspaceName } from '@/transport/metadata/fetch-workspace-name';

const findExistingRemote = (config: ConfigFile, remoteName: string) =>
  Object.hasOwn(config.remotes, remoteName)
    ? config.remotes[remoteName]
    : undefined;

const assertSameUrlOrReplace = ({
  existingRemote,
  remoteName,
  apiUrl,
  replace,
}: {
  existingRemote: RemoteEntry | undefined;
  remoteName: string;
  apiUrl: string;
  replace: boolean;
}) => {
  if (
    !isDefined(existingRemote) ||
    replace ||
    parseApiUrl({ rawUrl: existingRemote.apiUrl, sourceName: remoteName }) ===
      apiUrl
  ) {
    return;
  }

  throw new CliError({
    code: 'CONFIRMATION_REQUIRED',
    exitCode: EXIT_CODE.USAGE,
    message: `Remote ${remoteName} points to ${existingRemote.apiUrl}.`,
    hint: `Pass --replace to point it at ${apiUrl}.`,
  });
};

const readRemoteName = (options: Record<string, unknown>) => {
  const remoteName =
    readStringOption(options, 'name') ?? readStringOption(options, 'remote');

  if (!isDefined(remoteName)) {
    throw new CliError({
      code: 'USAGE',
      exitCode: EXIT_CODE.USAGE,
      message: 'Name the remote with --name.',
      hint: 'To sign in to a saved remote again, pass --remote <name>.',
    });
  }

  return validateRemoteName(remoteName);
};

export const runAuthLoginCommand: CommandRun = async ({ options, signal }) => {
  if (!readBooleanOption(options, 'withToken')) {
    throw new CliError({
      code: 'USAGE',
      exitCode: EXIT_CODE.USAGE,
      message: 'Browser sign-in is not available yet.',
      hint: `Pipe an API key instead: printf '%s' "$TWENTY_API_KEY" | twenty auth login --with-token --url <url> --name <name>`,
    });
  }

  const remoteName = readRemoteName(options);
  const replace = readBooleanOption(options, 'replace');
  const configPath = getConfigPath();
  const existingRemote = findExistingRemote(
    await readConfig(configPath),
    remoteName,
  );
  const urlOption = readStringOption(options, 'url');

  if (!isDefined(urlOption) && !isDefined(existingRemote)) {
    throw new CliError({
      code: 'USAGE',
      exitCode: EXIT_CODE.USAGE,
      message: `There is no remote named ${remoteName} yet.`,
      hint: 'Pass --url to create it.',
    });
  }

  const apiUrl = isDefined(urlOption)
    ? parseApiUrl({ rawUrl: urlOption, sourceName: '--url' })
    : parseApiUrl({
        rawUrl: existingRemote?.apiUrl ?? '',
        sourceName: `The URL of remote ${remoteName}`,
      });

  assertSameUrlOrReplace({ existingRemote, remoteName, apiUrl, replace });

  const apiKey = await readApiKeyFromStandardInput(signal);
  const workspaceName = await fetchWorkspaceName({
    target: {
      apiUrl,
      bearerToken: apiKey,
      credentialKind: 'apiKey',
      source: 'remote',
      remoteName,
    },
    signal,
  }).catch((error: unknown) => {
    if (error instanceof CliError && error.code === 'AUTH_REQUIRED') {
      throw new CliError({
        code: 'AUTH_REQUIRED',
        exitCode: EXIT_CODE.AUTHENTICATION,
        message: `${apiUrl} rejected this API key. Nothing was saved.`,
        hint: 'Check the key and that it belongs to a workspace on this server.',
        details: error.details,
      });
    }

    throw error;
  });

  const isDefault = await updateConfig(configPath, (config) => {
    const latestRemote = findExistingRemote(config, remoteName);

    assertSameUrlOrReplace({
      existingRemote: latestRemote,
      remoteName,
      apiUrl,
      replace,
    });

    const {
      twentyCLIAccessToken: _accessToken,
      twentyCLIRefreshToken: _refreshToken,
      ...preservedFields
    } = latestRemote ?? { apiUrl };
    const hasUsableDefault =
      isDefined(config.defaultRemote) &&
      Object.hasOwn(config.remotes, config.defaultRemote);
    const defaultRemote =
      readBooleanOption(options, 'use') || !hasUsableDefault
        ? remoteName
        : config.defaultRemote;

    return {
      result: defaultRemote === remoteName,
      config: {
        ...config,
        defaultRemote,
        remotes: {
          ...config.remotes,
          [remoteName]: {
            ...preservedFields,
            apiUrl,
            apiKey,
            ...(isDefined(workspaceName) ? { workspaceName } : {}),
          },
        },
      },
    };
  });

  return {
    data: {
      remote: remoteName,
      apiUrl,
      credentials: 'apiKey',
      workspaceName,
      isDefault,
    },
    human: [
      formatSuccessLine(
        `Saved remote ${remoteName} ${dimText(`(${apiUrl}) · API key${isDefined(workspaceName) ? ` · workspace ${workspaceName}` : ''}`)}`,
      ),
      ...(isDefault
        ? [dimText(`  ${remoteName} is your default remote.`)]
        : []),
    ].join('\n'),
  };
};
