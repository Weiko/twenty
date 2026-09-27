import { type TargetSource } from '@/target/types/target-source.type';

export type ResolvedTarget = {
  apiUrl: string;
  bearerToken: string;
  source: TargetSource;
};
