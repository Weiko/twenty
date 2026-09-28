import { fork } from 'node:child_process';

import { isString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { APP_WORKER } from '@/app/constants/app-worker.constant';
import { createAppWorkerEnvironment } from '@/app/create-app-worker-environment';
import { getAppWorkerLaunch } from '@/app/get-app-worker-launch';
import { type AppOperation } from '@/app/types/app-operation.type';
import {
  type AppWorkerRequest,
  type AppWorkerResponse,
} from '@/app/types/app-worker-message.type';
import { CliError } from '@/output/cli-error';
import { EXIT_CODE } from '@/output/constants/exit-code.constant';
import { isJsonObject } from '@/utils/is-json-object';

export type AppWorkerOutput = {
  stdout: string;
  stderr: string;
  isTruncated: boolean;
};

const createOutputCollector = () => {
  const chunks: Buffer[] = [];
  let size = 0;
  let isTruncated = false;

  return {
    add: (chunk: Buffer) => {
      const kept = chunk.subarray(
        0,
        Math.max(0, APP_WORKER.OUTPUT_LIMIT_BYTES - size),
      );

      chunks.push(kept);
      size += kept.length;
      isTruncated ||= kept.length < chunk.length;
    },
    read: () => ({
      text: Buffer.concat(chunks).toString('utf8'),
      isTruncated,
    }),
  };
};

const isWorkerResponse = (value: unknown): value is AppWorkerResponse =>
  isJsonObject(value) &&
  ((value.type === 'result' && 'result' in value) ||
    (value.type === 'failure' && isString(value.message)));

export const runAppWorker = async ({
  operation,
  appPath,
  buildEntryPath,
  signal,
}: {
  operation: AppOperation;
  appPath: string;
  buildEntryPath: string;
  signal: AbortSignal;
}) => {
  signal.throwIfAborted();

  const { modulePath, execArgv } = getAppWorkerLaunch();
  const worker = fork(modulePath, [], {
    env: createAppWorkerEnvironment(process.env),
    execArgv,
    serialization: 'json',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const stdout = createOutputCollector();
  const stderr = createOutputCollector();

  worker.stdout?.on('data', stdout.add);
  worker.stderr?.on('data', stderr.add);

  return new Promise<{
    result: unknown;
    release?: unknown;
    output: AppWorkerOutput;
  }>((resolve, reject) => {
    let response: AppWorkerResponse | undefined;
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
    const cancel = () => {
      if (worker.connected) {
        worker.send({ type: 'cancel' } satisfies AppWorkerRequest);
      }

      killTimer = setTimeout(
        () => worker.kill('SIGKILL'),
        APP_WORKER.CANCEL_GRACE_MILLISECONDS,
      );
    };
    const settle = (settleWith: () => void) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      signal.removeEventListener('abort', cancel);
      clearTimeout(killTimer);
      settleWith();
    };

    signal.addEventListener('abort', cancel, { once: true });

    worker.on('message', (message: unknown) => {
      if (isWorkerResponse(message)) {
        response = message;
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

    worker.on('close', (exitCode, exitSignal) =>
      settle(() => {
        const output = readOutput();

        if (response?.type === 'result') {
          resolve({
            result: response.result,
            release: response.release,
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

        reject(
          new CliError({
            code: 'WORKER_FAILED',
            message:
              response?.type === 'failure'
                ? `The build worker failed: ${response.message}`
                : `The build worker stopped before finishing (${isDefined(exitSignal) ? `signal ${exitSignal}` : `exit code ${exitCode}`}). The app or the SDK may have exited the process.`,
            details: { exitCode, signal: exitSignal, output },
          }),
        );
      }),
    );

    worker.send({
      type: 'run',
      operation,
      appPath,
      buildEntryPath,
    } satisfies AppWorkerRequest);
  });
};
