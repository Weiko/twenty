import { type Output } from '@/output/types/output.type';

export type CommandContext = {
  command: string;
  arguments: unknown[];
  options: Record<string, unknown>;
  output: Output;
  signal: AbortSignal;
};
