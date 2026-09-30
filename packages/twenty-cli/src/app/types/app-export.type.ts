import { type Manifest } from 'twenty-shared/application';

import { type APP_EXPORT_COVERAGE_STATUSES } from '@/app/constants/app-export-coverage-statuses.constant';

export type AppExportCoverageEntry = {
  metadataName: string;
  universalIdentifier: string;
  status: (typeof APP_EXPORT_COVERAGE_STATUSES)[number];
  reason: string | null;
};

export type AppExportFile = {
  folder: string;
  path: string;
  content: string;
};

export type AppExport = {
  application: {
    universalIdentifier: string;
    displayName: string;
    sourceType: string;
  };
  manifest: Manifest;
  coverage: AppExportCoverageEntry[];
  files: AppExportFile[];
};
