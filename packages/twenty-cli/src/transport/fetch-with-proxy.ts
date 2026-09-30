import { type EnvHttpProxyAgent } from 'undici';

import { CliError } from '@/output/cli-error';

let proxyAgent: Promise<EnvHttpProxyAgent> | undefined;

const createProxyAgent = async () => {
  try {
    const { EnvHttpProxyAgent } = await import('undici');

    return new EnvHttpProxyAgent();
  } catch {
    throw new CliError({
      code: 'INVALID_CONFIG',
      message: 'Could not configure the network proxy.',
      hint: 'Check HTTP_PROXY, HTTPS_PROXY, http_proxy and https_proxy.',
    });
  }
};

export const fetchWithProxy: typeof fetch = async (input, init) => {
  const httpProxy = process.env.http_proxy ?? process.env.HTTP_PROXY;
  const httpsProxy = process.env.https_proxy ?? process.env.HTTPS_PROXY;

  if (!httpProxy && !httpsProxy) {
    return fetch(input, init);
  }

  proxyAgent ??= createProxyAgent();

  const options = { ...init, dispatcher: await proxyAgent };

  return fetch(input, options);
};
