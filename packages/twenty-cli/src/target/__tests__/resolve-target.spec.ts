import { describe, expect, it } from 'vitest';

import { type CliError } from '@/output/cli-error';
import { resolveTarget } from '@/target/resolve-target';

const captureError = (environment: NodeJS.ProcessEnv) => {
  try {
    resolveTarget({ environment });
  } catch (error) {
    return error as CliError;
  }

  throw new Error('Expected resolveTarget to throw');
};

describe('resolveTarget', () => {
  it('uses the environment URL and API key together', () => {
    expect(
      resolveTarget({
        environment: {
          TWENTY_API_URL: 'https://Acme.Twenty.com/crm/',
          TWENTY_API_KEY: 'secret',
        },
      }),
    ).toEqual({
      apiUrl: 'https://acme.twenty.com/crm',
      bearerToken: 'secret',
      source: 'environment',
    });
  });

  it('requires a target when nothing is set', () => {
    expect(captureError({})).toMatchObject({
      code: 'TARGET_REQUIRED',
      exitCode: 2,
    });
  });

  it('treats empty values as unset', () => {
    expect(captureError({ TWENTY_API_URL: ' ', TWENTY_API_KEY: '' }).code).toBe(
      'TARGET_REQUIRED',
    );
  });

  it('names the missing half of the environment pair', () => {
    expect(
      captureError({ TWENTY_API_URL: 'https://acme.twenty.com' }),
    ).toMatchObject({
      code: 'INCOMPLETE_TARGET',
      exitCode: 2,
      message: 'TWENTY_API_KEY is not set.',
    });
    expect(captureError({ TWENTY_API_KEY: 'secret' }).message).toBe(
      'TWENTY_API_URL is not set.',
    );
  });

  it('refuses TWENTY_REMOTE combined with environment credentials', () => {
    expect(
      captureError({ TWENTY_REMOTE: 'prod', TWENTY_API_KEY: 'secret' }),
    ).toMatchObject({ code: 'CONFLICTING_TARGET', exitCode: 2 });
  });

  it('does not accept TWENTY_REMOTE before saved remotes exist', () => {
    expect(captureError({ TWENTY_REMOTE: 'prod' }).code).toBe(
      'TARGET_REQUIRED',
    );
  });

  it.each([
    'acme.twenty.com',
    'ftp://acme.twenty.com',
    'https://user:password@acme.twenty.com',
    'https://acme.twenty.com?workspace=1',
    'https://acme.twenty.com#fragment',
  ])('rejects the API URL %s', (apiUrl) => {
    expect(
      captureError({ TWENTY_API_URL: apiUrl, TWENTY_API_KEY: 'secret' }),
    ).toMatchObject({ code: 'INVALID_API_URL', exitCode: 2 });
  });
});
