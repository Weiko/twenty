import { styleText } from 'node:util';

export const dimText = (
  text: string,
  stream: NodeJS.WriteStream = process.stdout,
) => styleText('dim', text, { stream });

export const colorText = (
  color: 'cyan' | 'magenta' | 'yellow',
  text: string,
  stream: NodeJS.WriteStream = process.stdout,
) => styleText(color, text, { stream });

export const formatFailureLine = (message: string) =>
  `${styleText('red', '✗', { stream: process.stderr })} ${message}`;

export const formatWarningLine = (message: string) =>
  `${styleText('yellow', '!', { stream: process.stderr })} ${message}`;
