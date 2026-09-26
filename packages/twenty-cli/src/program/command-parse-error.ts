import { type CommanderError } from 'commander';

export class CommandParseError extends Error {
  readonly commanderError: CommanderError;
  readonly commandName: string;
  readonly unknownCommandArguments?: string[];

  constructor({
    commanderError,
    commandName,
    unknownCommandArguments,
  }: {
    commanderError: CommanderError;
    commandName: string;
    unknownCommandArguments?: string[];
  }) {
    super(commanderError.message);
    this.name = 'CommandParseError';
    this.commanderError = commanderError;
    this.commandName = commandName;
    this.unknownCommandArguments = unknownCommandArguments;
  }
}
