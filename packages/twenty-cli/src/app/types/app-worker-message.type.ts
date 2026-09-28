import { type AppOperation } from '@/app/types/app-operation.type';

export type AppWorkerRequest =
  | {
      type: 'run';
      operation: AppOperation;
      appPath: string;
      buildEntryPath: string;
    }
  | { type: 'cancel' };

export type AppWorkerResponse =
  | { type: 'result'; result: unknown; release?: unknown }
  | { type: 'failure'; message: string };
