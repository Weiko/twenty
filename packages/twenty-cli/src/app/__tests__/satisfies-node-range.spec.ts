import { describe, expect, it } from 'vitest';

import { satisfiesNodeRange } from '@/app/satisfies-node-range';

describe('satisfiesNodeRange', () => {
  it.each([
    ['24.5.0', '^24.5.0', true],
    ['24.9.1', '^24.5.0', true],
    ['24.4.9', '^24.5.0', false],
    ['25.0.0', '^24.5.0', false],
    ['0.2.5', '^0.2.3', true],
    ['0.3.0', '^0.2.3', false],
    ['24.5.9', '~24.5.0', true],
    ['24.6.0', '~24.5.0', false],
    ['26.1.0', '>=24.5.0', true],
    ['24.5.0', '>24.5.0', false],
    ['22.0.0', '>=20.0.0 <23.0.0', true],
    ['23.0.0', '>=20.0.0 <23.0.0', false],
    ['24.5.0', '^20.0.0 || ^24.0.0', true],
    ['21.0.0', '^20.0.0 || ^24.0.0', false],
    ['24.5.0', '24', false],
    ['24.0.0', '24', true],
    ['v24.5.0', '^24', true],
  ])('checks Node %s against %s', (version, range, expected) => {
    expect(satisfiesNodeRange({ version, range })).toBe(expected);
  });

  it.each(['latest', '', '^24.5.0 ||', '24.x'])(
    'returns undefined for a range it cannot read: %j',
    (range) => {
      expect(satisfiesNodeRange({ version: '24.5.0', range })).toBeUndefined();
    },
  );
});
