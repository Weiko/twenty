import { isArray, isString } from '@sniptt/guards';
import { isDefined, isPlainObject } from 'twenty-shared/utils';

import { isLocaleCatalog } from '@/app/translations/is-locale-catalog';

import { type ExportedManifest } from '@/app/types/exported-manifest.type';

const PULL_COLLECTIONS = [
  'objects',
  'fields',
  'indexes',
  'roles',
  'permissionFlags',
  'views',
  'viewFields',
  'pageLayouts',
  'pageLayoutTabs',
  'pageLayoutWidgets',
  'navigationMenuItems',
];

const isEntityCollection = (value: unknown, children: string[] = []): boolean =>
  !isDefined(value) ||
  (isArray(value) &&
    value.every(
      (entry) =>
        isPlainObject(entry) &&
        isString(entry.universalIdentifier) &&
        children.every((key) =>
          isEntityCollection(entry[key], key === 'tabs' ? ['widgets'] : []),
        ),
    ));

export const isExportedManifest = (value: unknown): value is ExportedManifest =>
  isPlainObject(value) &&
  isPlainObject(value.application) &&
  isString(value.application.universalIdentifier) &&
  (!isDefined(value.translations) ||
    (isPlainObject(value.translations) &&
      Object.values(value.translations).every(isLocaleCatalog))) &&
  PULL_COLLECTIONS.every((key) =>
    isEntityCollection(
      value[key],
      key === 'objects' || key === 'views'
        ? ['fields']
        : key === 'pageLayouts'
          ? ['tabs']
          : key === 'pageLayoutTabs'
            ? ['widgets']
            : [],
    ),
  ) &&
  (!isArray(value.objects) ||
    value.objects.every(
      (entry) => isPlainObject(entry) && isString(entry.nameSingular),
    ));
