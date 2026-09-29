import { isArray, isNonEmptyString } from '@sniptt/guards';
import { APPLICATION_FILE_UPLOAD_BATCH_SIZE } from 'twenty-shared/application';
import { isDefined, isNonEmptyArray, isPlainObject } from 'twenty-shared/utils';

import { APP_APPLY } from '@/app/constants/app-apply.constant';
import { UPLOAD_FILE_FOLDER_BY_ARTIFACT_ROLE } from '@/app/constants/upload-file-folder-by-artifact-role.constant';
import { putUploadFile } from '@/app/put-upload-file';
import { readSnapshotFile } from '@/app/read-snapshot-file';
import { type AppUploadProgress } from '@/app/types/app-upload-progress.type';
import {
  type ToolingArtifact,
  type ToolingBuild,
} from '@/app/types/tooling-result.type';
import { CliError } from '@/output/cli-error';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';
import { sendGraphqlRequest } from '@/transport/graphql/send-graphql-request';

type UploadTarget = {
  fileId: string;
  filePath: string;
  uploadUrl: string;
  contentType: string;
};

type UploadFailure = {
  path: string;
  message: string;
};

type UploadBatchContext = {
  applicationUniversalIdentifier: string;
  snapshotDirectory: string;
  target: ResolvedTarget;
  signal: AbortSignal;
  progress: AppUploadProgress;
};

const CREATE_UPLOADS_MUTATION = `mutation CreateApplicationFileUploads($applicationUniversalIdentifier: String!, $files: [ApplicationFileUploadRequestInput!]!) {
  createApplicationFileUploads(applicationUniversalIdentifier: $applicationUniversalIdentifier, files: $files) {
    targets {
      fileId
      filePath
      uploadUrl
      contentType
    }
    errors {
      filePath
      message
    }
  }
}`;

const COMPLETE_UPLOADS_MUTATION = `mutation CompleteApplicationFileUploads($applicationUniversalIdentifier: String!, $fileIds: [UUID!]!) {
  completeApplicationFileUploads(applicationUniversalIdentifier: $applicationUniversalIdentifier, fileIds: $fileIds) {
    errors {
      fileId
      message
    }
  }
}`;

const createInvalidUploadResponseError = () =>
  new CliError({
    code: 'INVALID_RESPONSE',
    message: 'The server returned an invalid file upload response.',
  });

const isUploadTarget = (value: unknown): value is UploadTarget =>
  isPlainObject(value) &&
  isNonEmptyString(value.fileId) &&
  isNonEmptyString(value.filePath) &&
  isNonEmptyString(value.uploadUrl) &&
  isNonEmptyString(value.contentType);

const readUploadErrors = ({
  value,
  idKey,
}: {
  value: unknown;
  idKey: 'filePath' | 'fileId';
}) => {
  if (!isArray(value)) {
    throw createInvalidUploadResponseError();
  }

  return value.map((entry) => {
    const id = isPlainObject(entry) ? entry[idKey] : undefined;

    if (!isPlainObject(entry) || !isNonEmptyString(id)) {
      throw createInvalidUploadResponseError();
    }

    return {
      id,
      message: isNonEmptyString(entry.message)
        ? entry.message
        : 'The server refused this file.',
    };
  });
};

const toUploadRequest = (artifact: ToolingArtifact) => {
  const fileFolder = UPLOAD_FILE_FOLDER_BY_ARTIFACT_ROLE[artifact.role];

  if (!isDefined(fileFolder)) {
    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message: `The build contains a ${artifact.role} file, which the CLI cannot upload.`,
      details: { path: artifact.path, role: artifact.role },
    });
  }

  return { fileFolder, filePath: artifact.path, size: artifact.size };
};

const runConcurrently = async <TItem>({
  items,
  run,
}: {
  items: TItem[];
  run: (item: TItem) => Promise<void>;
}) => {
  let nextIndex = 0;

  const runNext = async (): Promise<void> => {
    if (nextIndex >= items.length) {
      return;
    }

    const item = items[nextIndex];

    nextIndex += 1;
    await run(item);
    await runNext();
  };

  await Promise.all(
    Array.from(
      { length: Math.min(APP_APPLY.UPLOAD_CONCURRENCY, items.length) },
      runNext,
    ),
  );
};

const requestUploadTargets = async ({
  artifacts,
  context,
}: {
  artifacts: ToolingArtifact[];
  context: UploadBatchContext;
}) => {
  const data = await sendGraphqlRequest({
    target: context.target,
    signal: context.signal,
    endpoint: 'metadata',
    query: CREATE_UPLOADS_MUTATION,
    variables: {
      applicationUniversalIdentifier: context.applicationUniversalIdentifier,
      files: artifacts.map(toUploadRequest),
    },
  });
  const created = data?.createApplicationFileUploads;

  if (
    !isPlainObject(created) ||
    !isArray(created.targets) ||
    !created.targets.every(isUploadTarget)
  ) {
    throw createInvalidUploadResponseError();
  }

  const refusals = readUploadErrors({
    value: created.errors,
    idKey: 'filePath',
  });
  const answeredPaths = new Set([
    ...created.targets.map((uploadTarget) => uploadTarget.filePath),
    ...refusals.map(({ id }) => id),
  ]);

  return {
    uploadTargets: created.targets,
    failures: [
      ...refusals.map(({ id, message }) => ({ path: id, message })),
      ...artifacts
        .filter((artifact) => !answeredPaths.has(artifact.path))
        .map((artifact) => ({
          path: artifact.path,
          message: 'The server did not accept this file.',
        })),
    ],
  };
};

const sendUploadedBytes = async ({
  uploadTargets,
  artifactByPath,
  context,
  failures,
}: {
  uploadTargets: UploadTarget[];
  artifactByPath: Map<string, ToolingArtifact>;
  context: UploadBatchContext;
  failures: UploadFailure[];
}) => {
  const sentTargets: UploadTarget[] = [];

  await runConcurrently({
    items: uploadTargets,
    run: async (uploadTarget) => {
      const artifact = artifactByPath.get(uploadTarget.filePath);

      if (!isDefined(artifact)) {
        failures.push({
          path: uploadTarget.filePath,
          message: 'The server asked for a file this build does not have.',
        });

        return;
      }

      const bytes = await readSnapshotFile({
        snapshotDirectory: context.snapshotDirectory,
        artifact,
      });

      try {
        const status = await putUploadFile({
          uploadUrl: uploadTarget.uploadUrl,
          contentType: uploadTarget.contentType,
          bytes,
          signal: context.signal,
        });

        if (status < 200 || status >= 300) {
          failures.push({
            path: artifact.path,
            message: `File storage answered ${status}.`,
          });

          return;
        }

        sentTargets.push(uploadTarget);
      } catch (error) {
        if (context.signal.aborted || error instanceof CliError) {
          throw error;
        }

        failures.push({
          path: artifact.path,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  return sentTargets;
};

const completeUploads = async ({
  sentTargets,
  artifactByPath,
  context,
  failures,
}: {
  sentTargets: UploadTarget[];
  artifactByPath: Map<string, ToolingArtifact>;
  context: UploadBatchContext;
  failures: UploadFailure[];
}) => {
  if (!isNonEmptyArray(sentTargets)) {
    return;
  }

  const data = await sendGraphqlRequest({
    target: context.target,
    signal: context.signal,
    endpoint: 'metadata',
    query: COMPLETE_UPLOADS_MUTATION,
    variables: {
      applicationUniversalIdentifier: context.applicationUniversalIdentifier,
      fileIds: sentTargets.map((uploadTarget) => uploadTarget.fileId),
    },
  });
  const completion = data?.completeApplicationFileUploads;

  if (!isPlainObject(completion)) {
    throw createInvalidUploadResponseError();
  }

  const completionErrors = readUploadErrors({
    value: completion.errors,
    idKey: 'fileId',
  });
  const failedFileIds = new Set(completionErrors.map(({ id }) => id));
  const pathByFileId = new Map(
    sentTargets.map((uploadTarget) => [
      uploadTarget.fileId,
      uploadTarget.filePath,
    ]),
  );

  failures.push(
    ...completionErrors.map(({ id, message }) => ({
      path: pathByFileId.get(id) ?? id,
      message,
    })),
  );

  for (const uploadTarget of sentTargets) {
    if (!failedFileIds.has(uploadTarget.fileId)) {
      context.progress.fileCount += 1;
      context.progress.byteCount +=
        artifactByPath.get(uploadTarget.filePath)?.size ?? 0;
    }
  }
};

export const uploadAppFiles = async ({
  build,
  snapshotDirectory,
  target,
  signal,
  progress,
}: {
  build: ToolingBuild;
  snapshotDirectory: string;
  target: ResolvedTarget;
  signal: AbortSignal;
  progress: AppUploadProgress;
}) => {
  build.files.forEach(toUploadRequest);

  for (const artifact of build.files) {
    await readSnapshotFile({ snapshotDirectory, artifact });
  }

  const context: UploadBatchContext = {
    applicationUniversalIdentifier: build.application.universalIdentifier,
    snapshotDirectory,
    target,
    signal,
    progress,
  };
  const artifactByPath = new Map(
    build.files.map((artifact) => [artifact.path, artifact]),
  );
  const failures: UploadFailure[] = [];

  for (
    let batchStart = 0;
    batchStart < build.files.length;
    batchStart += APPLICATION_FILE_UPLOAD_BATCH_SIZE
  ) {
    const { uploadTargets, failures: refusals } = await requestUploadTargets({
      artifacts: build.files.slice(
        batchStart,
        batchStart + APPLICATION_FILE_UPLOAD_BATCH_SIZE,
      ),
      context,
    });

    failures.push(...refusals);

    const sentTargets = await sendUploadedBytes({
      uploadTargets,
      artifactByPath,
      context,
      failures,
    });

    await completeUploads({ sentTargets, artifactByPath, context, failures });
  }

  if (isNonEmptyArray(failures)) {
    throw new CliError({
      code: 'UPLOAD_FAILED',
      message: `${failures.length} of ${build.files.length} files could not be uploaded.`,
      details: { failures },
    });
  }
};
