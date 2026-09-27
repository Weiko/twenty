import { isArray, isObject } from '@sniptt/guards';

export const isJsonObject = (
  value: unknown,
): value is Record<string, unknown> => isObject(value) && !isArray(value);
