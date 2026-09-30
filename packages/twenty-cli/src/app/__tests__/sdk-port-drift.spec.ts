import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import sources from '@/app/sdk-port-sources.json';

const sdkSource = fileURLToPath(
  new URL('../../../../twenty-sdk/src/', import.meta.url),
);

describe('SDK manifest and bundle port source drift', () => {
  it.each(Object.entries(sources.files))(
    'still matches the reviewed source of %s',
    async (path, checksum) => {
      const bytes = await readFile(`${sdkSource}${path}`);
      expect(
        createHash('sha256').update(bytes).digest('hex'),
        `SDK source changed since ${sources.sourceCommit}. Mirror the change in the CLI, re-run parity, then update the recorded source.`,
      ).toBe(checksum);
    },
  );
});
