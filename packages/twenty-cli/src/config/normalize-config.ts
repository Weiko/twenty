import { isString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import {
  type ConfigFile,
  type RemoteEntry,
} from '@/config/types/config-file.type';
import { isJsonObject } from '@/utils/is-json-object';

const LEGACY_DEFAULT_PROFILE_NAME = 'default';

const LEGACY_REMOTE_NAME = 'local';

const LEGACY_FIELD_ALIASES: Record<string, string[]> = {
  twentyCLIAccessToken: ['accessToken', 'applicationAccessToken'],
  twentyCLIRefreshToken: ['refreshToken', 'applicationRefreshToken'],
  twentyCLIRegistrationClientId: ['oauthClientId'],
};

const LEGACY_ALIAS_FIELDS = Object.values(LEGACY_FIELD_ALIASES).flat();

const LEGACY_TOP_LEVEL_REMOTE_FIELDS = [
  'apiUrl',
  'apiKey',
  'appRegistrationId',
  'appRegistrationClientId',
  ...Object.entries(LEGACY_FIELD_ALIASES).flat(2),
];

const toRemoteEntry = (value: unknown): RemoteEntry | undefined => {
  if (!isJsonObject(value) || !isString(value.apiUrl)) {
    return undefined;
  }

  const aliasedFields = Object.fromEntries(
    Object.entries(LEGACY_FIELD_ALIASES).flatMap(([field, aliases]) => {
      const aliasValue = [field, ...aliases]
        .map((name) => value[name])
        .find(isString);

      return isDefined(aliasValue) ? [[field, aliasValue]] : [];
    }),
  );

  const fieldsWithoutAliases = Object.fromEntries(
    Object.entries(value).filter(
      ([field]) => !LEGACY_ALIAS_FIELDS.includes(field),
    ),
  );

  return { ...fieldsWithoutAliases, apiUrl: value.apiUrl, ...aliasedFields };
};

const toRemoteName = (name: string) =>
  name === LEGACY_DEFAULT_PROFILE_NAME ? LEGACY_REMOTE_NAME : name;

const normalizeRemotes = (
  value: unknown,
): Record<string, RemoteEntry> | undefined => {
  if (!isJsonObject(value)) {
    return undefined;
  }

  const remotes: Record<string, RemoteEntry> = {};

  for (const [name, entry] of Object.entries(value)) {
    const remote = toRemoteEntry(entry);

    if (!isDefined(remote)) {
      return undefined;
    }

    remotes[toRemoteName(name)] = remote;
  }

  return remotes;
};

const normalizeLegacyConfig = (
  raw: Record<string, unknown>,
): ConfigFile | undefined => {
  const profileRemotes = normalizeRemotes(raw.profiles ?? {});
  const currentRemotes = normalizeRemotes(raw.remotes ?? {});

  if (!isDefined(profileRemotes) || !isDefined(currentRemotes)) {
    return undefined;
  }

  const topLevelRemote = toRemoteEntry(
    Object.fromEntries(
      LEGACY_TOP_LEVEL_REMOTE_FIELDS.filter((field) => field in raw).map(
        (field) => [field, raw[field]],
      ),
    ),
  );
  const otherFields = Object.fromEntries(
    Object.entries(raw).filter(
      ([field]) =>
        !LEGACY_TOP_LEVEL_REMOTE_FIELDS.includes(field) &&
        !['profiles', 'remotes', 'defaultWorkspace', 'version'].includes(field),
    ),
  );
  const remotes = { ...profileRemotes, ...currentRemotes };

  if (isDefined(topLevelRemote) && !(LEGACY_REMOTE_NAME in remotes)) {
    remotes[LEGACY_REMOTE_NAME] = topLevelRemote;
  }

  return {
    ...otherFields,
    version: 1,
    remotes,
    ...(isString(raw.defaultWorkspace)
      ? { defaultRemote: toRemoteName(raw.defaultWorkspace) }
      : {}),
  };
};

export const normalizeConfig = (raw: unknown): ConfigFile | undefined => {
  if (!isJsonObject(raw)) {
    return undefined;
  }

  if (raw.version !== 1 && ('profiles' in raw || 'apiUrl' in raw)) {
    return normalizeLegacyConfig(raw);
  }

  const remotes = normalizeRemotes(raw.remotes ?? {});

  if (
    !isDefined(remotes) ||
    (isDefined(raw.defaultRemote) && !isString(raw.defaultRemote))
  ) {
    return undefined;
  }

  return { ...raw, version: 1, remotes };
};
