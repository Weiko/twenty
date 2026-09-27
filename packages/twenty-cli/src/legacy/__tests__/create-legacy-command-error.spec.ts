import { describe, expect, it } from 'vitest';

import { createLegacyCommandError } from '@/legacy/create-legacy-command-error';

describe('createLegacyCommandError', () => {
  it('points a known twenty-sdk command at its future replacement', () => {
    const error = createLegacyCommandError({
      legacyCommand: 'app:publish',
      remainingArguments: ['--path', 'apps/billing'],
    });

    expect(error?.code).toBe('USAGE');
    expect(error?.exitCode).toBe(2);
    expect(error?.message).toContain('twenty app publish');
    expect(error?.hint).toBe(
      'In your app project, keep using: yarn twenty app:publish --path apps/billing',
    );
    expect(error?.details).toEqual({
      legacyCommand: 'app:publish',
      replacement: 'app publish',
      replacementAvailable: false,
    });
  });

  it('says when a twenty-sdk command has no equivalent yet', () => {
    const error = createLegacyCommandError({
      legacyCommand: 'dev:generate-client',
      remainingArguments: [],
    });

    expect(error?.message).toContain('no equivalent here yet');
    expect(error?.details).toMatchObject({ replacement: null });
  });

  it('knows two-word twenty-sdk spellings', () => {
    const error = createLegacyCommandError({
      legacyCommand: 'remote add',
      remainingArguments: [],
    });

    expect(error?.details).toMatchObject({ replacement: 'auth login' });
  });

  it('ignores commands that are not twenty-sdk spellings', () => {
    expect(
      createLegacyCommandError({
        legacyCommand: 'foo',
        remainingArguments: [],
      }),
    ).toBeUndefined();
    expect(
      createLegacyCommandError({
        legacyCommand: 'foo:bar',
        remainingArguments: [],
      }),
    ).toBeUndefined();
    expect(
      createLegacyCommandError({
        legacyCommand: 'constructor',
        remainingArguments: [],
      }),
    ).toBeUndefined();
  });
});
