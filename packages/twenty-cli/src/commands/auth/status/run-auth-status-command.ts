import { isDefined } from 'twenty-shared/utils';

import { type CommandRun } from '@/catalog/types/command-run.type';
import { type TargetCommandContext } from '@/catalog/types/target-command-context.type';
import { CREDENTIAL_KIND_LABELS } from '@/config/constants/credential-kind-labels.constant';
import { getConfigPath } from '@/config/get-config-path';
import { readConfig } from '@/config/read-config';
import { formatDetails } from '@/output/format-details';
import { dimText } from '@/output/style';
import { TARGET_ENVIRONMENT_VARIABLE } from '@/target/constants/target-environment-variable.constant';
import { fetchWorkspaceName } from '@/transport/metadata/fetch-workspace-name';

export const runAuthStatusCommand: CommandRun<TargetCommandContext> = async ({
  target,
  signal,
}) => {
  const workspaceName = await fetchWorkspaceName({ target, signal });
  const isDefaultRemote =
    isDefined(target.remoteName) &&
    (await readConfig(getConfigPath())).defaultRemote === target.remoteName;
  const remoteLabel = isDefined(target.remoteName)
    ? `${target.remoteName}${isDefaultRemote ? dimText(' (default)') : ''}`
    : dimText(
        `none, using ${TARGET_ENVIRONMENT_VARIABLE.API_URL} and ${TARGET_ENVIRONMENT_VARIABLE.API_KEY}`,
      );

  return {
    data: {
      remote: target.remoteName ?? null,
      isDefaultRemote,
      apiUrl: target.apiUrl,
      source: target.source,
      credentials: target.credentialKind,
      workspaceName,
    },
    human: formatDetails([
      ['Remote', remoteLabel],
      ['Server', target.apiUrl],
      ['Workspace', workspaceName ?? dimText('unnamed')],
      [
        'Credentials',
        `${CREDENTIAL_KIND_LABELS[target.credentialKind]} · valid`,
      ],
    ]),
  };
};
