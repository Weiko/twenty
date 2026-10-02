import { validate as uuidValidate, version as uuidVersion } from 'uuid';

import { MINIMUM_UNIVERSAL_IDENTIFIER_UUID_VERSION } from '@/app/manifest/utils/manifest-validation-helpers';

export const isValidUniversalIdentifier = (identifier: string): boolean =>
  uuidValidate(identifier) &&
  uuidVersion(identifier) >= MINIMUM_UNIVERSAL_IDENTIFIER_UUID_VERSION;
