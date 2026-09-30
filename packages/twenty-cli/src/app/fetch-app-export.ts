import { isArray, isNull, isString } from '@sniptt/guards';
import { isPlainObject } from 'twenty-shared/utils';

import { createAppNotInstalledError } from '@/app/create-app-not-installed-error';
import { isApplicationNotFoundError } from '@/app/is-application-not-found-error';
import { isSameUniversalIdentifier } from '@/app/is-same-universal-identifier';
import { isExportedManifest } from '@/app/pull/is-exported-manifest';
import {
  type AppExport,
  type AppExportCoverageEntry,
} from '@/app/types/app-export.type';
import { CliError } from '@/output/cli-error';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { sendGraphqlRequest } from '@/transport/graphql/send-graphql-request';

const EXPORT_QUERY = `query ExportApplication($universalIdentifier: UUID!) {
  exportApplication(universalIdentifier: $universalIdentifier) {
    application {
      universalIdentifier
      displayName
      sourceType
    }
    manifest
    coverage {
      metadataName
      universalIdentifier
      status
      reason
    }
    files {
      folder
      path
      content
    }
  }
}`;

const NOT_EXPORTABLE_SUB_CODES = new Set([
  'APPLICATION_NOT_EXPORTABLE',
  'STANDARD_APPLICATION_NOT_EXPORTABLE',
]);

const isExportUnsupportedError = (error: unknown): error is CliError => {
  if (!(error instanceof CliError) || error.code !== 'GRAPHQL_ERROR') {
    return false;
  }

  const errors = error.details?.errors;

  if (!isArray(errors) || errors.length !== 1) {
    return false;
  }

  const entry: unknown = errors[0];

  return (
    isPlainObject(entry) &&
    (entry.code === 'GRAPHQL_VALIDATION_FAILED' ||
      (isNull(entry.code) && error.details?.status === 400)) &&
    isNull(entry.path) &&
    isString(entry.message) &&
    entry.message.startsWith(
      'Cannot query field "exportApplication" on type "Query".',
    )
  );
};

const isNotExportableError = (error: unknown): error is CliError => {
  if (!(error instanceof CliError) || error.code !== 'GRAPHQL_ERROR') {
    return false;
  }

  const errors = error.details?.errors;

  if (!isArray(errors) || errors.length !== 1) {
    return false;
  }

  const entry: unknown = errors[0];

  return (
    isPlainObject(entry) &&
    isString(entry.subCode) &&
    NOT_EXPORTABLE_SUB_CODES.has(entry.subCode)
  );
};

const isCoverageEntry = (value: unknown): value is AppExportCoverageEntry =>
  isPlainObject(value) &&
  isString(value.metadataName) &&
  isString(value.universalIdentifier) &&
  isString(value.status) &&
  (isString(value.reason) || isNull(value.reason));

export const fetchAppExport = async ({
  universalIdentifier,
  target,
  signal,
}: {
  universalIdentifier: string;
  target: ResolvedTarget;
  signal: AbortSignal;
}): Promise<AppExport> => {
  const data = await sendGraphqlRequest({
    target,
    signal,
    endpoint: 'metadata',
    query: EXPORT_QUERY,
    variables: { universalIdentifier },
  }).catch((error: unknown) => {
    if (isApplicationNotFoundError({ error, field: 'exportApplication' })) {
      throw createAppNotInstalledError({
        universalIdentifier,
        apiUrl: target.apiUrl,
      });
    }

    if (isExportUnsupportedError(error)) {
      throw new CliError({
        code: 'APP_EXPORT_UNSUPPORTED',
        message: 'This server does not support application export.',
      });
    }

    if (isNotExportableError(error)) {
      throw new CliError({
        code: 'APP_NOT_EXPORTABLE',
        message: error.message,
        hint: 'Only apps developed locally can be pulled: not the standard app, and not apps installed from a package.',
        details: { universalIdentifier },
      });
    }

    throw error;
  });
  const applicationExport = data?.exportApplication;

  if (
    !isPlainObject(applicationExport) ||
    !isPlainObject(applicationExport.application) ||
    !isString(applicationExport.application.universalIdentifier) ||
    !isSameUniversalIdentifier({
      value: applicationExport.application.universalIdentifier,
      universalIdentifier,
    }) ||
    !isString(applicationExport.application.displayName) ||
    !isString(applicationExport.application.sourceType) ||
    !isExportedManifest(applicationExport.manifest) ||
    !isSameUniversalIdentifier({
      value: applicationExport.manifest.application.universalIdentifier,
      universalIdentifier,
    }) ||
    !isArray(applicationExport.coverage) ||
    !applicationExport.coverage.every(isCoverageEntry) ||
    !isArray(applicationExport.files)
  ) {
    throw new CliError({
      code: 'INVALID_RESPONSE',
      message: `The server returned an export of ${universalIdentifier} that this CLI cannot read.`,
    });
  }

  if (applicationExport.files.length > 0) {
    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message:
        'The application export contains source or dependency files that this CLI cannot reconcile. The pull base was not changed.',
      hint: 'Use a CLI version that supports this export format.',
    });
  }

  return {
    application: {
      universalIdentifier: applicationExport.application.universalIdentifier,
      displayName: applicationExport.application.displayName,
      sourceType: applicationExport.application.sourceType,
    },
    manifest: applicationExport.manifest,
    coverage: applicationExport.coverage,
    files: [],
  };
};
