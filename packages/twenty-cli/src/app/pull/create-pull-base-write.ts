import { PULL_BASE_FILE_PATH } from '@/app/constants/pull-base-file-path.constant';
import { normalizePullTarget } from '@/app/pull/normalize-pull-target';
import { type ExportedManifest } from '@/app/types/exported-manifest.type';
import { type PullTarget } from '@/app/types/pull-target.type';

export const createPullBaseWrite = ({
  manifest,
  target,
  unreconciledUniversalIdentifiers = [],
}: {
  manifest: ExportedManifest;
  target: PullTarget;
  unreconciledUniversalIdentifiers?: string[];
}) => ({
  relativePath: PULL_BASE_FILE_PATH,
  content: `${JSON.stringify(
    {
      version: 2,
      target: normalizePullTarget(target),
      applicationUniversalIdentifier: manifest.application.universalIdentifier,
      manifest,
      ...(unreconciledUniversalIdentifiers.length > 0
        ? { unreconciledUniversalIdentifiers }
        : {}),
    },
    null,
    2,
  )}\n`,
});
