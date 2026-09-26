import { styleText } from 'node:util';

export const dimText = (
  text: string,
  stream: NodeJS.WriteStream = process.stdout,
) => styleText('dim', text, { stream });

export const formatFailureLine = (message: string) =>
  `${styleText('red', '✗', { stream: process.stderr })} ${message}`;

export const formatWarningLine = (message: string) =>
  `${styleText('yellow', '!', { stream: process.stderr })} ${message}`;
