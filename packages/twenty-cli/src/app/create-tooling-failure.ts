import { type ToolingDiagnostic } from '@/app/types/tooling-result.type';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';

export const createToolingFailure = ({
  error,
  diagnostics,
  sdkVersion,
}: {
  error: { code: string; message: string };
  diagnostics: ToolingDiagnostic[];
  sdkVersion: string;
}) => {
  if (error.code === 'CANCELLED') {
    return new CliError({
      code: 'CANCELLED',
      message: 'Cancelled.',
      exitCode: EXIT_CODE.CANCELLED,
    });
  }

  const errorCount = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  ).length;
  const details = { sdkErrorCode: error.code, sdkVersion, diagnostics };

  if (error.code === 'TYPECHECK_FAILED') {
    return new CliError({
      code: 'TYPECHECK_FAILED',
      message:
        errorCount > 0
          ? `Typecheck failed with ${errorCount} ${errorCount === 1 ? 'error' : 'errors'}.`
          : `Typecheck failed: ${error.message}`,
      details,
    });
  }

  return new CliError({
    code: 'BUILD_FAILED',
    message: `The build failed: ${error.message}`,
    details,
  });
};
