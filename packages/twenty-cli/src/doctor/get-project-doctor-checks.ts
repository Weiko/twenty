import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

import { resolveAppProject } from '@/app/resolve-app-project';
import { resolveProjectSdk } from '@/app/resolve-project-sdk';
import { APP_OPERATION_CAPABILITIES } from '@/app/constants/app-operation-capabilities.constant';
import { type AppProject } from '@/app/types/app-project.type';
import { type DoctorCheck } from '@/doctor/types/doctor-check.type';
import { CliError } from '@/output/cli-error';

export const getProjectDoctorChecks = async ({
  explicitPath,
  workingDirectory,
  signal,
}: {
  explicitPath: string | undefined;
  workingDirectory: string;
  signal: AbortSignal;
}): Promise<DoctorCheck[]> => {
  let project: AppProject;

  signal.throwIfAborted();

  try {
    project = await resolveAppProject({ explicitPath, workingDirectory });
  } catch (error) {
    signal.throwIfAborted();

    const isOptional =
      !isDefined(explicitPath) &&
      error instanceof CliError &&
      (error.code === 'APP_NOT_FOUND' || error.code === 'APP_PATH_REQUIRED');

    return [
      {
        id: 'project',
        status: isOptional ? 'skipped' : 'fail',
        message:
          error instanceof CliError
            ? error.message
            : 'Could not inspect the app directory.',
        hint: 'Use --path <app directory> to check a specific app.',
      },
      { id: 'sdk', status: 'skipped', message: 'No app was selected.' },
    ];
  }

  const projectCheck: DoctorCheck = {
    id: 'project',
    status: 'pass',
    message: `${project.name} at ${project.path}.`,
    details: { name: project.name, path: project.path },
  };

  try {
    signal.throwIfAborted();

    const sdk = await resolveProjectSdk({
      appPath: project.path,
    });
    const missingCapabilities = [
      ...new Set(Object.values(APP_OPERATION_CAPABILITIES).flat()),
    ].filter((capability) => !sdk.capabilities.includes(capability));

    const checks: DoctorCheck[] = [
      projectCheck,
      {
        id: 'sdk',
        status: 'pass',
        message: `twenty-sdk ${sdk.version}, protocol ${sdk.protocolVersion}. Advertised capabilities: ${isNonEmptyArray(sdk.capabilities) ? sdk.capabilities.join(', ') : 'none'}.`,
        details: {
          version: sdk.version,
          path: sdk.packagePath,
          protocolVersion: sdk.protocolVersion,
          capabilities: sdk.capabilities,
        },
      },
    ];

    if (isNonEmptyArray(missingCapabilities)) {
      checks.push({
        id: 'sdk-capabilities',
        status: 'warning',
        message: `Some app build or typecheck operations are unavailable. Missing capabilities: ${missingCapabilities.join(', ')}.`,
        hint: 'Upgrade the app-local twenty-sdk to use those operations.',
        details: { missingCapabilities },
      });
    }

    return checks;
  } catch (error) {
    signal.throwIfAborted();

    return [
      projectCheck,
      {
        id: 'sdk',
        status: 'fail',
        code: error instanceof CliError ? error.code : 'INTERNAL_ERROR',
        message:
          error instanceof CliError
            ? error.message
            : 'Could not inspect the app SDK installation.',
        hint:
          error instanceof CliError
            ? error.hint
            : 'Check that the app dependencies are installed and readable.',
      },
    ];
  }
};
