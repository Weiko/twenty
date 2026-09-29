import { fork } from 'node:child_process';

import { isString } from '@sniptt/guards';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

import { APP_WORKER } from '@/app/constants/app-worker.constant';
import { createAppWorkerEnvironment } from '@/app/create-app-worker-environment';
import { createOutputCollector } from '@/app/create-output-collector';
import { getAppWorkerLaunch } from '@/app/get-app-worker-launch';
import { type AppOperation } from '@/app/types/app-operation.type';
import { type AppWorkerOutput } from '@/app/types/app-worker-output.type';
import {
  type AppWorkerRequest,
  type AppWorkerResponse,
} from '@/app/types/app-worker-message.type';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';

type HeldBuild = {
  result: unknown;
  output: AppWorkerOutput;
};

type HeldWorkOutcome =
  | { isSuccessful: true }
  | { isSuccessful: false; error: unknown };

const isWorkerResponse = (value: unknown): value is AppWorkerResponse =>
  isPlainObject(value) &&
  ((value.type === 'result' &&
    'result' in value &&
    (value.isSnapshotHeld === true || value.isSnapshotHeld === false)) ||
    (value.type === 'released' && 'release' in value) ||
    (value.type === 'failure' && isString(value.message)));

export const runAppWorker = async ({
  operation,
  appPath,
  buildEntryPath,
  signal,
  useHeldSnapshot,
}: {
  operation: AppOperation;
  appPath: string;
  buildEntryPath: string;
  signal: AbortSignal;
  useHeldSnapshot?: (heldBuild: HeldBuild) => Promise<void>;
}) => {
  signal.throwIfAborted();

  const { modulePath, execArgv } = getAppWorkerLaunch();
  const worker = fork(modulePath, [], {
    env: createAppWorkerEnvironment(process.env),
    execArgv,
    serialization: 'json',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const stdout = createOutputCollector(APP_WORKER.OUTPUT_LIMIT_BYTES);
  const stderr = createOutputCollector(APP_WORKER.OUTPUT_LIMIT_BYTES);

  worker.stdout?.on('data', stdout.add);
  worker.stderr?.on('data', stderr.add);

  return new Promise<{
    result: unknown;
    release?: unknown;
    isSnapshotHeld: boolean;
    output: AppWorkerOutput;
  }>((resolve, reject) => {
    let resultResponse:
      | Extract<AppWorkerResponse, { type: 'result' }>
      | undefined;
    let failureResponse:
      | Extract<AppWorkerResponse, { type: 'failure' }>
      | undefined;
    let releasedResponse:
      | Extract<AppWorkerResponse, { type: 'released' }>
      | undefined;
    let heldWork: Promise<HeldWorkOutcome> | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    let isSettled = false;

    const readOutput = (): AppWorkerOutput => {
      const standardOutput = stdout.read();
      const standardError = stderr.read();

      return {
        stdout: standardOutput.text,
        stderr: standardError.text,
        isTruncated: standardOutput.isTruncated || standardError.isTruncated,
      };
    };
    const askToStop = (request: AppWorkerRequest) => {
      if (worker.connected) {
        worker.send(request);
      }

      killTimer = setTimeout(
        () => worker.kill('SIGKILL'),
        APP_WORKER.CANCEL_GRACE_MILLISECONDS,
      );
    };
    const cancel = () => askToStop({ type: 'cancel' });
    const settle = (settleWith: () => void) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      signal.removeEventListener('abort', cancel);
      clearTimeout(killTimer);
      settleWith();
    };
    const startHeldWork = (result: unknown) => {
      signal.removeEventListener('abort', cancel);
      clearTimeout(killTimer);

      const runHeldWork = isDefined(useHeldSnapshot)
        ? useHeldSnapshot({ result, output: readOutput() })
        : Promise.resolve();

      heldWork = runHeldWork
        .then(
          (): HeldWorkOutcome => ({ isSuccessful: true }),
          (error: unknown): HeldWorkOutcome => ({
            isSuccessful: false,
            error,
          }),
        )
        .finally(() => askToStop({ type: 'release' }));
    };
    const finish = ({
      exitCode,
      exitSignal,
      heldOutcome,
    }: {
      exitCode: number | null;
      exitSignal: NodeJS.Signals | null;
      heldOutcome?: HeldWorkOutcome;
    }) =>
      settle(() => {
        const output = readOutput();

        if (isDefined(heldOutcome) && !heldOutcome.isSuccessful) {
          reject(heldOutcome.error);

          return;
        }

        if (isDefined(resultResponse)) {
          resolve({
            result: resultResponse.result,
            release: resultResponse.isSnapshotHeld
              ? releasedResponse?.release
              : resultResponse.release,
            isSnapshotHeld: resultResponse.isSnapshotHeld,
            output,
          });

          return;
        }

        if (signal.aborted) {
          reject(
            new CliError({
              code: 'CANCELLED',
              message: 'Cancelled.',
              exitCode: EXIT_CODE.CANCELLED,
            }),
          );

          return;
        }

        const stopReason = isDefined(exitSignal)
          ? `signal ${exitSignal}`
          : `exit code ${exitCode}`;

        reject(
          new CliError({
            code: 'WORKER_FAILED',
            message: isDefined(failureResponse)
              ? `The build worker failed: ${failureResponse.message}`
              : `The build worker stopped before finishing (${stopReason}). The app or the SDK may have exited the process.`,
            details: { exitCode, signal: exitSignal, output },
          }),
        );
      });

    signal.addEventListener('abort', cancel, { once: true });

    worker.on('message', (message: unknown) => {
      if (!isWorkerResponse(message)) {
        return;
      }

      if (message.type === 'released') {
        releasedResponse = message;

        return;
      }

      if (message.type === 'failure') {
        failureResponse = message;

        return;
      }

      resultResponse = message;

      if (message.isSnapshotHeld) {
        startHeldWork(message.result);
      }
    });

    worker.on('error', (error) =>
      settle(() =>
        reject(
          new CliError({
            code: 'WORKER_FAILED',
            message: `The build worker could not run: ${error.message}`,
          }),
        ),
      ),
    );

    worker.on('close', (exitCode, exitSignal) => {
      if (!isDefined(heldWork)) {
        finish({ exitCode, exitSignal });

        return;
      }

      heldWork.then((heldOutcome) =>
        finish({ exitCode, exitSignal, heldOutcome }),
      );
    });

    worker.send({
      type: 'run',
      operation,
      appPath,
      buildEntryPath,
      holdSnapshot: isDefined(useHeldSnapshot),
    } satisfies AppWorkerRequest);
  });
};
