import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { CliError } from '@/output/cli-error';
import { API_URL_PROTOCOLS } from '@/target/constants/api-url-protocols.constant';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { createMetadataClient } from '@/transport/metadata/create-metadata-client';

export const fetchWorkspaceUrl = async ({
  target,
  signal,
}: {
  target: ResolvedTarget;
  signal: AbortSignal;
}) => {
  const client = createMetadataClient({ target, signal });
  const { currentWorkspace } = await client.query({
    currentWorkspace: {
      workspaceUrls: { customUrl: true, subdomainUrl: true },
    },
  });
  const workspaceUrls = currentWorkspace?.workspaceUrls;
  const workspaceUrl = URL.parse(
    isNonEmptyString(workspaceUrls?.customUrl)
      ? workspaceUrls.customUrl
      : (workspaceUrls?.subdomainUrl ?? ''),
  );

  if (
    !isDefined(workspaceUrl) ||
    !API_URL_PROTOCOLS.includes(workspaceUrl.protocol)
  ) {
    throw new CliError({
      code: 'INVALID_RESPONSE',
      message: `${target.apiUrl} did not return a web address for this workspace.`,
    });
  }

  return workspaceUrl;
};
