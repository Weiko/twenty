import { type PullTarget } from '@/app/types/pull-target.type';

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
  | { type: 'generateSourceClient'; appPath: string; schema: string }
  | { type: 'readSourceIdentity'; appPath: string }
  | { type: 'buildManifest'; appPath: string }
  | { type: 'typecheckSource'; appPath: string }
  | { type: 'bundleSnapshot'; appPath: string; holdSnapshot: boolean }
  | {
      type: 'pull';
      appPath: string;
      applicationExport: unknown;
      target: PullTarget;
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
