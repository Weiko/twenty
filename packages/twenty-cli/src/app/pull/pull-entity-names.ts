import { isUsableFileNameSegment } from '@/app/pull/pull-file-base-name';
import {
  getSystemRecordFormPageLayoutUniversalIdentifier,
  getSystemRecordPageLayoutUniversalIdentifier,
  getSystemViewUniversalIdentifier,
  type Manifest,
  type NavigationMenuItemManifest,
  SYSTEM_VIEW_KEYS,
} from 'twenty-shared/application';
import {
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

const STANDARD_OBJECT_NAME_BY_UNIVERSAL_IDENTIFIER = new Map<string, string>(
  Object.entries(STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS).map(
    ([name, universalIdentifier]) => [universalIdentifier, name] as const,
  ),
);

const STANDARD_PAGE_LAYOUT_NAME_BY_UNIVERSAL_IDENTIFIER = new Map<
  string,
  string
>(
  Object.entries(STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS).map(
    ([name, { universalIdentifier }]) => [universalIdentifier, name] as const,
  ),
);

export const getObjectName = ({
  objectUniversalIdentifier,
  manifest,
}: {
  objectUniversalIdentifier: string;
  manifest: Manifest;
}): string | null =>
  (manifest.objects ?? []).find(
    (objectManifest) =>
      objectManifest.universalIdentifier === objectUniversalIdentifier,
  )?.nameSingular ??
  STANDARD_OBJECT_NAME_BY_UNIVERSAL_IDENTIFIER.get(objectUniversalIdentifier) ??
  null;

export const getPageLayoutName = ({
  pageLayoutUniversalIdentifier,
  manifest,
}: {
  pageLayoutUniversalIdentifier: string;
  manifest: Manifest;
}): string | null => {
  const pageLayoutManifest = manifest.pageLayouts?.find(
    (candidate) =>
      candidate.universalIdentifier === pageLayoutUniversalIdentifier,
  );

  if (isDefined(pageLayoutManifest)) {
    return pageLayoutManifest.name;
  }

  const standardPageLayoutName =
    STANDARD_PAGE_LAYOUT_NAME_BY_UNIVERSAL_IDENTIFIER.get(
      pageLayoutUniversalIdentifier,
    );

  if (isDefined(standardPageLayoutName)) {
    return standardPageLayoutName;
  }

  const objectMetadataApplicationUniversalIdentifier =
    manifest.application.universalIdentifier;

  for (const objectManifest of manifest.objects ?? []) {
    const systemPageLayoutUniversalIdentifiers = {
      objectMetadataApplicationUniversalIdentifier,
      objectUniversalIdentifier: objectManifest.universalIdentifier,
    };

    if (
      getSystemRecordPageLayoutUniversalIdentifier(
        systemPageLayoutUniversalIdentifiers,
      ) === pageLayoutUniversalIdentifier
    ) {
      return `${objectManifest.nameSingular}RecordPage`;
    }

    if (
      getSystemRecordFormPageLayoutUniversalIdentifier(
        systemPageLayoutUniversalIdentifiers,
      ) === pageLayoutUniversalIdentifier
    ) {
      return `${objectManifest.nameSingular}RecordForm`;
    }
  }

  return null;
};

const getViewName = ({
  viewUniversalIdentifier,
  manifest,
}: {
  viewUniversalIdentifier: string;
  manifest: Manifest;
}): string | null => {
  const viewManifest = manifest.views?.find(
    (candidate) => candidate.universalIdentifier === viewUniversalIdentifier,
  );

  if (isDefined(viewManifest)) {
    return viewManifest.name;
  }

  const objectMetadataApplicationUniversalIdentifier =
    manifest.application.universalIdentifier;

  for (const objectManifest of manifest.objects ?? []) {
    if (
      getSystemViewUniversalIdentifier({
        objectMetadataApplicationUniversalIdentifier,
        objectUniversalIdentifier: objectManifest.universalIdentifier,
        viewKey: SYSTEM_VIEW_KEYS.INDEX,
      }) === viewUniversalIdentifier
    ) {
      return `${objectManifest.nameSingular}IndexView`;
    }
  }

  return null;
};

export const getNavigationMenuItemName = ({
  navigationMenuItemManifest,
  manifest,
}: {
  navigationMenuItemManifest: NavigationMenuItemManifest;
  manifest: Manifest;
}): string | null => {
  const {
    name,
    targetObjectUniversalIdentifier,
    viewUniversalIdentifier,
    pageLayoutUniversalIdentifier,
  } = navigationMenuItemManifest;

  if (isUsableFileNameSegment(name)) {
    return name;
  }

  if (isDefined(targetObjectUniversalIdentifier)) {
    return getObjectName({
      objectUniversalIdentifier: targetObjectUniversalIdentifier,
      manifest,
    });
  }

  if (isDefined(viewUniversalIdentifier)) {
    return getViewName({ viewUniversalIdentifier, manifest });
  }

  if (isDefined(pageLayoutUniversalIdentifier)) {
    return getPageLayoutName({ pageLayoutUniversalIdentifier, manifest });
  }

  return null;
};

export const getNavigationMenuItemFolderName = ({
  folderUniversalIdentifier,
  manifest,
}: {
  folderUniversalIdentifier: string;
  manifest: Manifest;
}): string | null => {
  const folderName = manifest.navigationMenuItems?.find(
    (candidate) => candidate.universalIdentifier === folderUniversalIdentifier,
  )?.name;

  return isUsableFileNameSegment(folderName) ? folderName : null;
};
