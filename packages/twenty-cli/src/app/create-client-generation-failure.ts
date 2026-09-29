import { isNonEmptyString } from '@sniptt/guards';

import { type AppApplyPhase } from '@/app/types/app-apply-phase.type';
import { withPhaseDetails } from '@/app/with-phase-details';
import { CliError } from '@/output/cli-error';
import { toCliError } from '@/output/to-cli-error';

const RECOVERY_HINT =
  'The workspace already has this version of the app, but the client files in node_modules/twenty-client-sdk may be incomplete. Fix the problem, then run twenty app apply again: it repeats the preview, upload and sync before regenerating the client. twenty app plan shows what that sync would change.';

export const createClientGenerationFailure = ({
  error,
  applicationName,
  apiUrl,
  completedPhases,
  signal,
}: {
  error: unknown;
  applicationName: string;
  apiUrl: string;
  completedPhases: AppApplyPhase[];
  signal: AbortSignal;
}) => {
  const cliError = toCliError(error, signal);
  const message =
    cliError.code === 'CANCELLED'
      ? `${applicationName} was applied to ${apiUrl}, but generating its typed API client was cancelled.`
      : `${applicationName} was applied to ${apiUrl}, but its typed API client was not regenerated: ${cliError.message}`;

  return withPhaseDetails({
    error: new CliError({
      code: cliError.code,
      exitCode: cliError.exitCode,
      message,
      hint: [RECOVERY_HINT, cliError.hint].filter(isNonEmptyString).join(' '),
      details: cliError.details,
    }),
    phase: 'clientGeneration',
    outcome: 'applied',
    completedPhases,
    hint: RECOVERY_HINT,
  });
};
