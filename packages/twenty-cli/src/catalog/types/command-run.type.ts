import { type CommandContext } from '@/catalog/types/command-context.type';
import { type CommandResult } from '@/output/types/command-result.type';

export type CommandRun = (context: CommandContext) => Promise<CommandResult>;
