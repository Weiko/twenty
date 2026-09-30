import { readFile } from 'node:fs/promises';

export const readJson = async <TData = unknown>(
  filePath: string,
): Promise<TData> => JSON.parse(await readFile(filePath, 'utf-8')) as TData;
