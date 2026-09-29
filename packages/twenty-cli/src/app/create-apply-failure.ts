import {
  type AppApplyOutcome,
  type AppApplyPhase,
} from '@/app/types/app-apply-phase.type';
import { CliError } from '@/output/cli-error';
import { toCliError } from '@/output/to-cli-error';
import { type CliErrorCode } from '@/output/types/cli-error-code.type';

const REJECTED_BEFORE_EXECUTION_CODES = new Set<CliErrorCode>([
  'AUTH_REQUIRED',
  'PERMISSION_DENIED',
]);

const LOCAL_FAILURE_CODES = new Set<CliErrorCode>([
  'SNAPSHOT_INVALID',
  'TOOLING_UNSUPPORTED',
]);

const REJECTED_BY_SERVER_CODES = new Set<CliErrorCode>([
  'AUTH_REQUIRED',
  'CONFLICT',
  'GRAPHQL_ERROR',
  'HTTP_ERROR',
  'NOT_FOUND',
  'PERMISSION_DENIED',
]);

const getOutcome = ({
  phase,
  code,
  uploadedFileCount,
}: {
  phase: AppApplyPhase;
  code: CliErrorCode;
  uploadedFileCount: number;
}): AppApplyOutcome => {
  if (
    phase === 'build' ||
    phase === 'preview' ||
    phase === 'confirmation' ||
    REJECTED_BEFORE_EXECUTION_CODES.has(code)
  ) {
    return 'not-started';
  }

  if (phase === 'upload' && uploadedFileCount > 0) {
    return 'partial';
  }

  if (LOCAL_FAILURE_CODES.has(code)) {
    return 'not-started';
  }

  if (phase !== 'sync' && REJECTED_BY_SERVER_CODES.has(code)) {
    return 'not-started';
  }

  return 'unknown';
};

const getRecoveryHint = ({
  phase,
  outcome,
}: {
  phase: AppApplyPhase;
  outcome: AppApplyOutcome;
}) => {
  if (outcome === 'not-started') {
    return 'Fix the problem, then run twenty app apply again. It builds and previews from scratch.';
  }

  return `The ${phase} step may have changed the workspace. Run twenty app plan to see where it stands before applying again.`;
};

export const createApplyFailure = ({
  error,
  phase,
  completedPhases,
  uploadedFileCount,
  signal,
}: {
  error: unknown;
  phase: AppApplyPhase;
  completedPhases: AppApplyPhase[];
  uploadedFileCount: number;
  signal: AbortSignal;
}) => {
  const cliError = toCliError(error, signal);
  const outcome = getOutcome({
    phase,
    code: cliError.code,
    uploadedFileCount,
  });

  return new CliError({
    code: cliError.code,
    exitCode: cliError.exitCode,
    message: cliError.message,
    hint: cliError.hint ?? getRecoveryHint({ phase, outcome }),
    details: {
      ...cliError.details,
      phase,
      outcome,
      completedPhases: [...completedPhases],
    },
  });
};
