import { type AppWorkerOutput } from '@/app/run-app-worker';
import { type ToolingDiagnostic } from '@/app/types/tooling-result.type';

export const toWorkerOutputDiagnostics = (
  output: AppWorkerOutput,
): ToolingDiagnostic[] =>
  (
    [
      ['stdout', output.stdout],
      ['stderr', output.stderr],
    ] as const
  )
    .filter(([, text]) => text.trim() !== '')
    .map(([stream, text]) => ({
      severity: 'warning',
      code: 'PROJECT_OUTPUT',
      message: `The app or twenty-sdk wrote to ${stream}:\n${text.trimEnd()}${output.isTruncated ? '\n(output truncated)' : ''}`,
    }));
