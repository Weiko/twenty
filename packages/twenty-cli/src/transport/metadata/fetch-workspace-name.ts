import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { createMetadataClient } from '@/transport/metadata/create-metadata-client';

export const fetchWorkspaceName = async ({
  target,
  signal,
}: {
  target: ResolvedTarget;
  signal: AbortSignal;
}) => {
  const { currentWorkspace } = await createMetadataClient({
    target,
    signal,
  }).query({ currentWorkspace: { displayName: true } });

  return currentWorkspace.displayName ?? null;
};
