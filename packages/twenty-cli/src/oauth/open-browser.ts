import { execFile } from 'node:child_process';

const getOpenCommand = (url: string): [string, string[]] => {
  if (process.platform === 'darwin') {
    return ['open', [url]];
  }

  if (process.platform === 'win32') {
    return ['cmd', ['/c', 'start', '', url]];
  }

  return ['xdg-open', [url]];
};

export const openBrowser = (url: string) =>
  new Promise<boolean>((resolve) => {
    const [command, args] = getOpenCommand(url);

    execFile(command, args, (error) => resolve(error === null));
  });
