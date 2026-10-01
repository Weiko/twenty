import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBoundedFetch } from '@/transport/create-target-fetch';
import { fetchWithProxy } from '@/transport/fetch-with-proxy';

vi.mock('@/transport/fetch-with-proxy');
afterEach(() => vi.resetAllMocks());

describe('request-specific transport timeout', () => {
  it('ends a request at its configured deadline and reports that deadline', async () => {
    vi.mocked(fetchWithProxy).mockImplementation(
      async (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    const request = createBoundedFetch({
      apiUrl: 'https://example.test',
      signal: new AbortController().signal,
      timeoutMilliseconds: 20,
    });

    await expect(
      request('https://example.test/metadata'),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
      message: 'https://example.test did not answer within 0.02 seconds.',
    });
    expect(fetchWithProxy).toHaveBeenCalledOnce();
  });

  it('still cancels a long-running request immediately on user interruption', async () => {
    const controller = new AbortController();
    vi.mocked(fetchWithProxy).mockImplementation(
      async (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    const request = createBoundedFetch({
      apiUrl: 'https://example.test',
      signal: controller.signal,
      timeoutMilliseconds: 360_000,
    });
    const response = request('https://example.test/metadata');
    controller.abort();

    await expect(response).rejects.toBe(controller.signal.reason);
    expect(fetchWithProxy).toHaveBeenCalledOnce();
  });
});
