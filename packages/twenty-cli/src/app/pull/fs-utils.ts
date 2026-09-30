import { access, cp, mkdir, rm } from 'node:fs/promises';

export const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const ensureDir = (directoryPath: string) =>
  mkdir(directoryPath, { recursive: true });
export const copy = (source: string, destination: string) =>
  cp(source, destination, { recursive: true });
export const remove = (filePath: string) =>
  rm(filePath, { recursive: true, force: true });
