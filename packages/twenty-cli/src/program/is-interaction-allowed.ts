import { isNonEmptyString } from '@sniptt/guards';

const FALSE_VALUES = new Set(['0', 'false']);

export const isInteractionAllowed = (options: Record<string, unknown>) => {
  const continuousIntegration = process.env.CI;
  const isContinuousIntegration =
    isNonEmptyString(continuousIntegration) &&
    !FALSE_VALUES.has(continuousIntegration.toLowerCase());

  return options.input !== false && !isContinuousIntegration;
};
