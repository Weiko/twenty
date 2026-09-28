import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { isJsonObject } from '@/utils/is-json-object';

export const formatDataValue = (value: unknown): string => {
  if (!isDefined(value)) {
    return '-';
  }

  if (typeof value === 'string') {
    return /[\x00-\x1f\x7f-\x9f]/.test(value)
      ? JSON.stringify(value).replace(
          /[\x7f-\x9f]/g,
          (character) =>
            `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
        )
      : value;
  }

  if (isJsonObject(value)) {
    if (isNonEmptyString(value.firstName) || isNonEmptyString(value.lastName)) {
      return formatDataValue(
        [value.firstName, value.lastName].filter(isNonEmptyString).join(' '),
      );
    }

    if (isNonEmptyString(value.primaryEmail)) {
      return formatDataValue(value.primaryEmail);
    }

    if (isNonEmptyString(value.primaryLinkUrl)) {
      return formatDataValue(value.primaryLinkUrl);
    }

    if (isNonEmptyString(value.id) && isDefined(value.name)) {
      return `${formatDataValue(value.name)} (${formatDataValue(value.id)})`;
    }
  }

  return JSON.stringify(value);
};

export const formatDataCell = (value: unknown) => {
  const text = formatDataValue(value);

  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
};
