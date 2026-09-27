import { type ToolingApi } from 'twenty-shared/cli';

import { TOOLING_DESCRIPTOR } from '@/tooling/tooling-descriptor';

export const tooling: ToolingApi = {
  descriptor: TOOLING_DESCRIPTOR,
  build: async (options) =>
    (await import('@/tooling/build-snapshot')).buildSnapshot(options),
  typecheck: async (options) =>
    (await import('@/tooling/typecheck-application')).typecheckApplication(
      options,
    ),
  releaseSnapshot: async (options) =>
    (await import('@/tooling/build-snapshot')).releaseSnapshot(options),
};
