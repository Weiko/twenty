import { type ToolingDiagnostic } from '@/app/types/tooling-result.type';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';

export const createToolingFailure = ({
  error,
  diagnostics,
  sdkVersion,
  pipeline = 'sdk',
  operation = 'build',
}: {
  error: { code: string; message: string };
  diagnostics: ToolingDiagnostic[];
  sdkVersion: string;
  pipeline?: 'cli' | 'sdk';
  operation?: 'build' | 'generateClient';
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
  const errorLabel = errorCount === 1 ? 'error' : 'errors';
  const details = {
    ...(pipeline === 'sdk'
      ? { sdkErrorCode: error.code }
      : { toolingErrorCode: error.code }),
    sdkVersion,
    diagnostics,
  };

  if (pipeline === 'cli') {
    switch (error.code) {
      case 'SDK_SOURCE_UNSUPPORTED':
      case 'TYPESCRIPT_NOT_INSTALLED':
      case 'TOOLING_UNSUPPORTED':
      case 'NODE_VERSION_UNSUPPORTED':
        return new CliError({
          code: error.code,
          message: error.message,
          details,
        });
    }
  }

  if (error.code === 'TYPECHECK_FAILED') {
    return new CliError({
      code: 'TYPECHECK_FAILED',
      message:
        errorCount > 0
          ? `Typecheck failed with ${errorCount} ${errorLabel}.`
          : `Typecheck failed: ${error.message}`,
      details,
    });
  }

  return new CliError({
    code:
      operation === 'generateClient'
        ? 'CLIENT_GENERATION_FAILED'
        : 'BUILD_FAILED',
    message:
      operation === 'generateClient'
        ? error.message
        : `The build failed: ${error.message}`,
    details,
  });
};
