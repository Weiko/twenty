import { type AppOperation } from '@/app/types/app-operation.type';

export type AppWorkerRequest =
  | {
      type: 'run';
      operation: AppOperation;
      appPath: string;
      buildEntryPath: string;
      holdSnapshot: boolean;
    }
  | {
      type: 'generateClient';
      appPath: string;
      buildEntryPath: string;
      schema: string;
    }
  | { type: 'release' }
  | { type: 'cancel' };

export type AppWorkerResponse =
  | {
      type: 'result';
      result: unknown;
      release?: unknown;
      isSnapshotHeld: boolean;
    }
  | { type: 'released'; release: unknown }
  | { type: 'failure'; message: string };
