import { readFile } from 'node:fs/promises';

import { isJsonObject } from '@/utils/is-json-object';

export const readJsonObject = async (filePath: string) => {
  try {
    const value: unknown = JSON.parse(await readFile(filePath, 'utf8'));

    return isJsonObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
};
