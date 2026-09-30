import { isNull, isString } from '@sniptt/guards';
import { isPlainObject, isValidUuid } from 'twenty-shared/utils';

import { parseToolingResult } from '@/app/parse-tooling-result';
import { resolveSourceSdk } from '@/app/resolve-source-sdk';
import { runAppWorker } from '@/app/run-app-worker';
import { type AppSourceIdentity } from '@/app/source/types/app-source-identity.type';
import { toWorkerOutputDiagnostics } from '@/app/to-worker-output-diagnostics';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';

const parseIdentity = (
  value: unknown,
): { data: AppSourceIdentity } | undefined => {
  if (!isPlainObject(value)) {
    return undefined;
  }

  if (isNull(value.application)) {
    return { data: { application: null } };
  }

  const application = value.application;

  if (
    !isPlainObject(application) ||
    !isString(application.universalIdentifier) ||
    !isValidUuid(application.universalIdentifier) ||
    (!isString(application.displayName) && !isNull(application.displayName))
  ) {
    return undefined;
  }

  return {
    data: {
      application: {
        universalIdentifier: application.universalIdentifier,
        displayName: application.displayName,
      },
    },
  };
};

export const readAppIdentity = async ({
  appPath,
  signal,
}: {
  appPath: string;
  signal: AbortSignal;
}) => {
  signal.throwIfAborted();

  const sdk = await resolveSourceSdk({ appPath });
  const worker = await runAppWorker({
    request: { type: 'readSourceIdentity', appPath },
    signal,
  });

  if (signal.aborted) {
    throw new CliError({
      code: 'CANCELLED',
      message: 'Cancelled.',
      exitCode: EXIT_CODE.CANCELLED,
    });
  }

  const result = parseToolingResult({
    value: worker.result,
    parseData: parseIdentity,
  });
  const diagnostics = [
    ...result.diagnostics,
    ...toWorkerOutputDiagnostics(worker.output),
  ];

  if (!result.success) {
    throw new CliError({
      code:
        result.error.code === 'SDK_SOURCE_UNSUPPORTED'
          ? 'SDK_SOURCE_UNSUPPORTED'
          : 'IDENTITY_READ_FAILED',
      message: result.error.message,
      ...(result.error.code === 'SDK_SOURCE_UNSUPPORTED'
        ? {
            hint: 'Use the SDK define functions, rename local helpers with the same names, or install a compatible twenty-sdk version.',
          }
        : {}),
      details: { sdkVersion: sdk.version, diagnostics },
    });
  }

  return { ...result.data, diagnostics };
};
