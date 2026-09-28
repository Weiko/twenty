import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { isNumber, isString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { SUPPORTED_BUILD_PROTOCOL_VERSIONS } from '@/app/constants/app-build-protocol.constant';
import { APP_OPERATION_CAPABILITIES } from '@/app/constants/app-operation-capabilities.constant';
import { listAncestorDirectories } from '@/app/list-ancestor-directories';
import { readJsonObject } from '@/app/read-json-object';
import { satisfiesNodeRange } from '@/app/satisfies-node-range';
import { type AppOperation } from '@/app/types/app-operation.type';
import { type ProjectSdk } from '@/app/types/project-sdk.type';
import { CliError } from '@/output/cli-error';
import { isJsonObject } from '@/utils/is-json-object';

type Resolution = { path: string } | { errorCode?: string };

const UPGRADE_SDK_HINT =
  'Upgrade twenty-sdk in this app to a release that includes twenty-sdk/build, then install its dependencies again.';

const tryResolve = (
  resolveFromApp: NodeJS.RequireResolve,
  specifier: string,
): Resolution => {
  try {
    return { path: resolveFromApp(specifier) };
  } catch (error) {
    return isJsonObject(error) && isString(error.code)
      ? { errorCode: error.code }
      : {};
  }
};

const findSdkPackagePath = async (resolvedFilePath: string) => {
  for (const directory of listAncestorDirectories(dirname(resolvedFilePath))) {
    const packageJson = await readJsonObject(join(directory, 'package.json'));

    if (packageJson?.name === 'twenty-sdk') {
      return { path: directory, packageJson };
    }
  }

  return undefined;
};

const hasYarnPlugAndPlay = async (appPath: string) => {
  for (const directory of listAncestorDirectories(appPath)) {
    const hasLoader = await access(join(directory, '.pnp.cjs')).then(
      () => true,
      () => false,
    );

    if (hasLoader) {
      return true;
    }
  }

  return false;
};

const parseDescriptor = (value: unknown) => {
  if (
    !isJsonObject(value) ||
    !isNumber(value.protocolVersion) ||
    !isString(value.requiredNode) ||
    !Array.isArray(value.capabilities) ||
    !value.capabilities.every(isString)
  ) {
    return undefined;
  }

  return {
    protocolVersion: value.protocolVersion,
    requiredNode: value.requiredNode,
    capabilities: value.capabilities,
  };
};

const throwMissingSdk = async (appPath: string): Promise<never> => {
  if (await hasYarnPlugAndPlay(appPath)) {
    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message:
        "This app uses Yarn Plug'n'Play, which the twenty CLI cannot load the SDK from.",
      hint: 'Set nodeLinker: node-modules in .yarnrc.yml, then run yarn install.',
      details: { appPath },
    });
  }

  throw new CliError({
    code: 'SDK_NOT_INSTALLED',
    message: 'twenty-sdk is not installed for this app.',
    hint: "Install the app's dependencies (for example with yarn install), then try again.",
    details: { appPath },
  });
};

export const resolveProjectSdk = async ({
  appPath,
  operation,
}: {
  appPath: string;
  operation: AppOperation;
}): Promise<ProjectSdk> => {
  const resolveFromApp = createRequire(join(appPath, 'package.json')).resolve;
  const descriptorResolution = tryResolve(
    resolveFromApp,
    'twenty-sdk/build/descriptor.json',
  );

  if (!('path' in descriptorResolution)) {
    const packageResolution = tryResolve(resolveFromApp, 'twenty-sdk');

    if (!('path' in packageResolution)) {
      return throwMissingSdk(appPath);
    }

    const legacySdk = await findSdkPackagePath(packageResolution.path);
    const legacyVersion = isString(legacySdk?.packageJson.version)
      ? legacySdk.packageJson.version
      : 'unknown';

    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message: `twenty-sdk ${legacyVersion} in this app has no build API (twenty-sdk/build).`,
      hint: UPGRADE_SDK_HINT,
      details: {
        appPath,
        sdkPath: legacySdk?.path ?? null,
        sdkVersion: legacyVersion,
        supportedProtocolVersions: SUPPORTED_BUILD_PROTOCOL_VERSIONS,
      },
    });
  }

  const sdk = await findSdkPackagePath(descriptorResolution.path);
  const version = isString(sdk?.packageJson.version)
    ? sdk.packageJson.version
    : 'unknown';
  const packagePath = sdk?.path ?? dirname(descriptorResolution.path);
  const details = {
    appPath,
    sdkPath: packagePath,
    sdkVersion: version,
    supportedProtocolVersions: SUPPORTED_BUILD_PROTOCOL_VERSIONS,
  };
  const descriptor = parseDescriptor(
    await readJsonObject(descriptorResolution.path),
  );

  if (!isDefined(descriptor)) {
    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message: `twenty-sdk ${version} has an unreadable build descriptor.`,
      hint: UPGRADE_SDK_HINT,
      details,
    });
  }

  if (!SUPPORTED_BUILD_PROTOCOL_VERSIONS.includes(descriptor.protocolVersion)) {
    const isNewerProtocol =
      descriptor.protocolVersion >
      Math.max(...SUPPORTED_BUILD_PROTOCOL_VERSIONS);

    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message: `twenty-sdk ${version} uses build protocol ${descriptor.protocolVersion}; this CLI supports protocol ${SUPPORTED_BUILD_PROTOCOL_VERSIONS.join(', ')}.`,
      hint: isNewerProtocol ? 'Upgrade the twenty CLI.' : UPGRADE_SDK_HINT,
      details: { ...details, protocolVersion: descriptor.protocolVersion },
    });
  }

  const missingCapabilities = APP_OPERATION_CAPABILITIES[operation].filter(
    (capability) => !descriptor.capabilities.includes(capability),
  );

  if (missingCapabilities.length > 0) {
    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message: `twenty-sdk ${version} does not support ${missingCapabilities.join(', ')}.`,
      hint: UPGRADE_SDK_HINT,
      details: { ...details, missingCapabilities },
    });
  }

  const isNodeSupported = satisfiesNodeRange({
    version: process.versions.node,
    range: descriptor.requiredNode,
  });

  if (isNodeSupported === false) {
    throw new CliError({
      code: 'NODE_VERSION_UNSUPPORTED',
      message: `twenty-sdk ${version} needs Node ${descriptor.requiredNode}; this is Node ${process.versions.node}.`,
      hint: 'Switch to a supported Node version, then try again.',
      details: { ...details, requiredNode: descriptor.requiredNode },
    });
  }

  const entryResolution = tryResolve(resolveFromApp, 'twenty-sdk/build');

  if (!('path' in entryResolution)) {
    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message: `twenty-sdk ${version} has a build descriptor but no build entry point.`,
      hint: UPGRADE_SDK_HINT,
      details,
    });
  }

  return {
    version,
    packagePath,
    buildEntryPath: entryResolution.path,
    protocolVersion: descriptor.protocolVersion,
  };
};
