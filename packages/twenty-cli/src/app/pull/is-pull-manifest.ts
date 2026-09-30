import { isArray, isNonEmptyString, isString } from '@sniptt/guards';
import { type Manifest } from 'twenty-shared/application';
import { isDefined, isPlainObject, isValidUuid } from 'twenty-shared/utils';

const hasIdentifier = (value: unknown): boolean =>
  isPlainObject(value) &&
  isString(value.universalIdentifier) &&
  isValidUuid(value.universalIdentifier);

const ENTITY_LISTS = [
  'objects',
  'fields',
  'logicFunctions',
  'frontComponents',
  'permissionFlags',
  'roles',
  'skills',
  'agents',
  'views',
  'viewFields',
  'navigationMenuItems',
  'pageLayouts',
  'pageLayoutTabs',
  'pageLayoutWidgets',
  'commandMenuItems',
  'timelineActivityTypes',
  'settingsMenuItems',
];

const isEntityList = (value: unknown): boolean =>
  isArray(value) && value.every(hasIdentifier);

export const isPullManifest = (value: unknown): value is Manifest => {
  if (
    !isPlainObject(value) ||
    !hasIdentifier(value.application) ||
    !isPlainObject(value.application) ||
    !isString(value.application.displayName) ||
    !ENTITY_LISTS.every((key) => isEntityList(value[key])) ||
    !isArray(value.objects) ||
    !value.objects.every(
      (object) =>
        isPlainObject(object) &&
        isNonEmptyString(object.nameSingular) &&
        isEntityList(object.fields),
    ) ||
    !isArray(value.publicAssets)
  ) {
    return false;
  }

  if (
    isDefined(value.indexes) &&
    (!isArray(value.indexes) ||
      !value.indexes.every(
        (index) =>
          hasIdentifier(index) &&
          isPlainObject(index) &&
          isArray(index.fields) &&
          index.fields.every(
            (field) =>
              isPlainObject(field) && isString(field.fieldUniversalIdentifier),
          ),
      ))
  ) {
    return false;
  }

  return (
    (!isDefined(value.connectionProviders) ||
      isEntityList(value.connectionProviders)) &&
    (!isDefined(value.translations) ||
      (isPlainObject(value.translations) &&
        Object.values(value.translations).every(
          (catalog) =>
            isPlainObject(catalog) && Object.values(catalog).every(isString),
        )))
  );
};
