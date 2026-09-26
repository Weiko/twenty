import { type Command } from 'commander';
import { isDefined } from 'twenty-shared/utils';

import { getCommandName } from '@/catalog/get-command-name';
import { type CommandDefinition } from '@/catalog/types/command-definition.type';
import { type OutputMode } from '@/output/types/output-mode.type';
import { runCommand } from '@/program/run-command';
import { throwParseErrorOnExit } from '@/program/throw-parse-error-on-exit';

const findOrCreateTopic = (
  parent: Command,
  topicName: string,
  topicPath: string,
) => {
  const existingTopic = parent.commands.find(
    (command) => command.name() === topicName,
  );

  if (isDefined(existingTopic)) {
    return existingTopic;
  }

  return throwParseErrorOnExit(parent.command(topicName), topicPath);
};

export const registerCommand = ({
  program,
  definition,
  outputMode,
}: {
  program: Command;
  definition: CommandDefinition;
  outputMode: OutputMode;
}) => {
  const topicNames = definition.path.slice(0, -1);
  const parent = topicNames.reduce(
    (currentParent, topicName, topicIndex) =>
      findOrCreateTopic(
        currentParent,
        topicName,
        topicNames.slice(0, topicIndex + 1).join(' '),
      ),
    program,
  );
  const command = parent
    .command(definition.path[definition.path.length - 1])
    .description(definition.description);

  if (isDefined(definition.helpGroup)) {
    command.helpGroup(definition.helpGroup);
  }

  throwParseErrorOnExit(command, getCommandName(definition));

  command.action(() =>
    runCommand({
      definition,
      outputMode,
      commandArguments: command.processedArgs,
      options: command.optsWithGlobals(),
    }),
  );
};
