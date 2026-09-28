import { type AppOperation } from '@/app/types/app-operation.type';

export const APP_OPERATION_CAPABILITIES: Record<AppOperation, string[]> = {
  build: ['build', 'releaseSnapshot'],
  typecheck: ['typecheck'],
};
