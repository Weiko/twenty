import {
  type AppUninstallOutcome,
  type AppUninstallPhase,
} from '@/app/types/app-uninstall-phase.type';
import { withPhaseDetails } from '@/app/with-phase-details';
import { toCliError } from '@/output/to-cli-error';
import { type CliErrorCode } from '@/output/types/cli-error-code.type';

const REJECTED_BEFORE_UNINSTALL_CODES = new Set<CliErrorCode>([
  'AUTH_REQUIRED',
  'PERMISSION_DENIED',
]);

export const createUninstallFailure = ({
  error,
  phase,
  completedPhases,
  signal,
}: {
  error: unknown;
  phase: AppUninstallPhase;
  completedPhases: AppUninstallPhase[];
  signal: AbortSignal;
}) => {
  const cliError = toCliError(error, signal);
  const outcome: AppUninstallOutcome =
    phase !== 'uninstall' || REJECTED_BEFORE_UNINSTALL_CODES.has(cliError.code)
      ? 'not-started'
      : 'unknown';

  return withPhaseDetails({
    error: cliError,
    phase,
    outcome,
    completedPhases,
    hint:
      outcome === 'not-started'
        ? 'Fix the problem, then run twenty app uninstall again.'
        : 'The uninstall may have partly run. Run twenty app uninstall again: it reports APP_NOT_INSTALLED once the app is gone.',
  });
};
