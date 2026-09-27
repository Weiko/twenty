import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  parseSingleJsonLine,
  runCliForTest,
} from '@/__tests__/utils/run-cli-for-test';
import { sendJson, startTestServer } from '@/__tests__/utils/start-test-server';
import { openBrowser } from '@/oauth/open-browser';
import { refreshOAuthSession } from '@/oauth/refresh-oauth-session';

vi.mock('@/oauth/open-browser', () => ({ openBrowser: vi.fn() }));

const CLIENT_ID = 'cli-client';

type Scenario = {
  callback: 'approve' | 'decline' | 'wrongState' | 'wrongIssuer';
  tokenEndpointOrigin?: string;
};

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const createAccessToken = (expiresInSeconds: number, id: string) =>
  [
    encode({ alg: 'none' }),
    encode({ sub: id, exp: Math.floor(Date.now() / 1000) + expiresInSeconds }),
    'signature',
  ].join('.');

const state = {
  scenario: { callback: 'approve' } as Scenario,
  codeChallenge: '',
  isVerifierValid: false,
  currentRefreshToken: 'refresh-1',
  refreshCalls: 0,
  validAccessTokens: new Set<string>(),
};

const server = await startTestServer((request, response) => {
  const url = new URL(request.path, 'http://fake');

  if (url.pathname === '/.well-known/oauth-authorization-server') {
    return sendJson(response, 200, {
      issuer: server.url,
      authorization_endpoint: `${server.url}/authorize`,
      token_endpoint: `${state.scenario.tokenEndpointOrigin ?? server.url}/oauth/token`,
      cli_client_id: CLIENT_ID,
      code_challenge_methods_supported: ['S256'],
    });
  }

  if (url.pathname === '/authorize') {
    const callback = new URL(url.searchParams.get('redirect_uri') ?? '');
    const { callback: outcome } = state.scenario;

    state.codeChallenge = url.searchParams.get('code_challenge') ?? '';

    if (outcome === 'decline') {
      callback.searchParams.set('error', 'access_denied');
    } else {
      callback.searchParams.set('code', 'authorization-code');
    }

    callback.searchParams.set(
      'state',
      outcome === 'wrongState'
        ? 'forged'
        : (url.searchParams.get('state') ?? ''),
    );
    callback.searchParams.set(
      'iss',
      outcome === 'wrongIssuer' ? 'https://elsewhere.example.com' : server.url,
    );
    response.writeHead(302, { location: callback.href });

    return response.end();
  }

  if (url.pathname === '/oauth/token') {
    const parameters = JSON.parse(request.body);

    if (parameters.grant_type === 'authorization_code') {
      state.isVerifierValid =
        createHash('sha256')
          .update(parameters.code_verifier)
          .digest('base64url') === state.codeChallenge;

      if (!state.isVerifierValid || parameters.client_id !== CLIENT_ID) {
        return sendJson(response, 400, { error: 'invalid_grant' });
      }
    } else {
      state.refreshCalls += 1;

      if (parameters.refresh_token !== state.currentRefreshToken) {
        return sendJson(response, 400, {
          error: 'invalid_grant',
          error_description: 'The refresh token is invalid.',
        });
      }
    }

    const accessToken = createAccessToken(3600, `access-${Math.random()}`);

    state.currentRefreshToken = `refresh-${state.refreshCalls + 2}`;
    state.validAccessTokens.add(accessToken);

    return sendJson(response, 200, {
      access_token: accessToken,
      refresh_token: state.currentRefreshToken,
      token_type: 'Bearer',
      expires_in: 3600,
    });
  }

  const bearerToken = request.headers.authorization?.replace('Bearer ', '');

  if (!state.validAccessTokens.has(bearerToken ?? '')) {
    return sendJson(response, 200, {
      errors: [
        { message: 'Token invalid.', extensions: { code: 'UNAUTHENTICATED' } },
      ],
      data: null,
    });
  }

  return sendJson(response, 200, {
    data: {
      currentWorkspace: { displayName: 'Cloud' },
      currentUser: { email: 'jane@acme.com' },
    },
  });
});

const runJson = async (args: string[]) => {
  const { stdout, exitCode } = await runCliForTest([...args, '--json']);

  return { envelope: parseSingleJsonLine(stdout), exitCode };
};

describe('browser sign-in and session refresh', () => {
  let configPath: string;

  const readConfigFile = async () =>
    JSON.parse(await readFile(configPath, 'utf8'));

  const writeSession = async (accessToken: string, refreshToken: string) => {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        defaultRemote: 'cloud',
        remotes: {
          cloud: {
            apiUrl: server.url,
            twentyCLIAccessToken: accessToken,
            twentyCLIRefreshToken: refreshToken,
            twentyCLIRegistrationClientId: CLIENT_ID,
          },
        },
      }),
    );
  };

  beforeEach(async () => {
    const home = await mkdtemp(join(tmpdir(), 'twenty-cli-oauth-'));

    configPath = join(home, '.twenty', 'config.json');
    vi.stubEnv('HOME', home);
    vi.stubEnv('CI', '');
    vi.stubEnv('TWENTY_API_URL', '');
    vi.stubEnv('TWENTY_API_KEY', '');
    vi.stubEnv('TWENTY_REMOTE', '');
    Object.assign(state, {
      scenario: { callback: 'approve' },
      codeChallenge: '',
      isVerifierValid: false,
      currentRefreshToken: 'refresh-1',
      refreshCalls: 0,
    });
    vi.mocked(openBrowser).mockImplementation(async (url) => {
      await fetch(url);

      return true;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(openBrowser).mockReset();
  });

  afterAll(async () => {
    await server.close();
  });

  it('signs in with the browser using PKCE and saves the session', async () => {
    const { envelope, exitCode } = await runJson([
      'auth',
      'login',
      '--url',
      server.url,
      '--name',
      'cloud',
    ]);

    expect(exitCode).toBe(0);
    expect(state.isVerifierValid).toBe(true);
    expect(envelope.data).toEqual({
      remote: 'cloud',
      apiUrl: server.url,
      credentials: 'oauth',
      workspaceName: 'Cloud',
      email: 'jane@acme.com',
      isDefault: true,
    });

    const { remotes } = await readConfigFile();

    expect(remotes.cloud).toMatchObject({
      apiUrl: server.url,
      twentyCLIRefreshToken: 'refresh-2',
      twentyCLIRegistrationClientId: CLIENT_ID,
      workspaceName: 'Cloud',
    });
    expect(remotes.cloud).not.toHaveProperty('apiKey');
  });

  it.each([
    ['decline', 'Sign-in was declined in the browser.'],
    ['wrongState', 'The sign-in response does not match this login attempt.'],
    ['wrongIssuer', 'came from https://elsewhere.example.com'],
  ] as const)(
    'saves nothing when the callback is %s',
    async (callback, message) => {
      state.scenario = { callback };

      const { envelope, exitCode } = await runJson([
        'auth',
        'login',
        '--url',
        server.url,
        '--name',
        'cloud',
      ]);

      expect(exitCode).toBe(1);
      expect(envelope.error.code).toBe('OAUTH_FAILED');
      expect(envelope.error.message).toContain(message);
      await expect(readFile(configPath, 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );

  it('never sends the authorization code to another server', async () => {
    state.scenario = {
      callback: 'approve',
      tokenEndpointOrigin: 'https://elsewhere.example.com',
    };

    const { envelope } = await runJson([
      'auth',
      'login',
      '--url',
      server.url,
      '--name',
      'cloud',
    ]);

    expect(envelope.error.code).toBe('OAUTH_UNAVAILABLE');
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('refuses browser sign-in in CI', async () => {
    vi.stubEnv('CI', 'true');

    const { envelope, exitCode } = await runJson([
      'auth',
      'login',
      '--url',
      server.url,
      '--name',
      'cloud',
    ]);

    expect(exitCode).toBe(2);
    expect(envelope.error.code).toBe('USAGE');
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('refreshes an expiring session and keeps the rotated tokens', async () => {
    await writeSession(createAccessToken(10, 'expiring'), 'refresh-1');

    const { envelope, exitCode } = await runJson(['auth', 'status']);
    const { remotes } = await readConfigFile();

    expect(exitCode).toBe(0);
    expect(envelope.data).toMatchObject({
      credentials: 'oauth',
      email: 'jane@acme.com',
    });
    expect(state.refreshCalls).toBe(1);
    expect(remotes.cloud.twentyCLIRefreshToken).toBe('refresh-3');
    expect(
      state.validAccessTokens.has(remotes.cloud.twentyCLIAccessToken),
    ).toBe(true);
  });

  it('asks to sign in again when the refresh is rejected, without a browser', async () => {
    const expiredAccessToken = createAccessToken(-10, 'expired');

    await writeSession(expiredAccessToken, 'revoked-refresh-token');

    const { envelope, exitCode } = await runJson(['auth', 'status']);

    expect(exitCode).toBe(3);
    expect(envelope.error).toMatchObject({
      code: 'AUTH_REQUIRED',
      hint: 'Sign in again: twenty auth login --remote cloud',
    });
    expect(openBrowser).not.toHaveBeenCalled();
    expect((await readConfigFile()).remotes.cloud.twentyCLIAccessToken).toBe(
      expiredAccessToken,
    );
  });

  it('lets only one command refresh a session at a time', async () => {
    await writeSession(createAccessToken(10, 'expiring'), 'refresh-1');

    const refresh = () =>
      refreshOAuthSession({
        configPath,
        remoteName: 'cloud',
        apiUrl: server.url,
        signal: new AbortController().signal,
      });
    const [firstAccessToken, secondAccessToken] = await Promise.all([
      refresh(),
      refresh(),
    ]);

    expect(state.refreshCalls).toBe(1);
    expect(firstAccessToken).toBe(secondAccessToken);
  });

  describe('when the remote changes while a refresh waits for the lock', () => {
    const otherServerUrl = () => server.url.replace('127.0.0.1', 'localhost');

    const writeRemote = async (remote: Record<string, unknown>) => {
      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(
        configPath,
        JSON.stringify({ version: 1, remotes: { cloud: remote } }),
      );
    };

    const refreshSelectedServer = () =>
      refreshOAuthSession({
        configPath,
        remoteName: 'cloud',
        apiUrl: server.url,
        signal: new AbortController().signal,
      });

    it.each([
      [
        'pointed at another server',
        () => ({
          apiUrl: otherServerUrl(),
          twentyCLIAccessToken: createAccessToken(10, 'other-server'),
          twentyCLIRefreshToken: 'refresh-1',
          twentyCLIRegistrationClientId: CLIENT_ID,
        }),
      ],
      [
        'switched to an API key',
        () => ({ apiUrl: server.url, apiKey: 'api-key' }),
      ],
    ])(
      'refuses when the remote was %s, and sends nothing',
      async (_, remote) => {
        await writeRemote(remote());

        await expect(refreshSelectedServer()).rejects.toMatchObject({
          code: 'CONFLICT',
          exitCode: 6,
        });
        expect(state.refreshCalls).toBe(0);
      },
    );

    it('refuses when the remote was removed', async () => {
      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(configPath, JSON.stringify({ version: 1, remotes: {} }));

      await expect(refreshSelectedServer()).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('asks to sign in again when the remote was signed out', async () => {
      await writeRemote({ apiUrl: server.url });

      await expect(refreshSelectedServer()).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
        message: 'Remote cloud was signed out while this command was waiting.',
      });
    });

    it('uses a session signed in again on the same server', async () => {
      const freshAccessToken = createAccessToken(3600, 'signed-in-again');

      await writeRemote({
        apiUrl: server.url,
        twentyCLIAccessToken: freshAccessToken,
        twentyCLIRefreshToken: 'refresh-1',
        twentyCLIRegistrationClientId: CLIENT_ID,
      });

      await expect(refreshSelectedServer()).resolves.toBe(freshAccessToken);
      expect(state.refreshCalls).toBe(0);
    });
  });
});
