import { access, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { isArray, isNumber, isString } from '@sniptt/guards';
import { isDefined, isNonEmptyArray, isPlainObject } from 'twenty-shared/utils';

import { checkNodeRequirement } from '@/app/check-node-requirement';
import { SUPPORTED_BUILD_PROTOCOL_VERSIONS } from '@/app/constants/app-build-protocol.constant';
import { APP_OPERATION_CAPABILITIES } from '@/app/constants/app-operation-capabilities.constant';
import { listAncestorDirectories } from '@/app/list-ancestor-directories';
import { readJsonObject } from '@/app/read-json-object';
import { type AppOperation } from '@/app/types/app-operation.type';
import { type ProjectSdk } from '@/app/types/project-sdk.type';
import { CliError } from '@/output/cli-error';
import { isInsideDirectory } from '@/utils/is-inside-directory';

const UPGRADE_SDK_HINT =
  'Upgrade twenty-sdk in this app to a release that includes twenty-sdk/build, then install its dependencies again.';

const tryResolve = (
  resolveFromApp: NodeJS.RequireResolve,
  specifier: string,
) => {
  try {
    return resolveFromApp(specifier);
  } catch {
    return undefined;
  }
};

const findInstalledSdk = async (appPath: string) => {
  for (const directory of listAncestorDirectories(appPath)) {
    const packagePath = join(directory, 'node_modules', 'twenty-sdk');
    const isInstalled = await access(packagePath).then(
      () => true,
      () => false,
    );

    if (!isInstalled) {
      continue;
    }

    const packageJson = await readJsonObject(join(packagePath, 'package.json'));

    if (!isDefined(packageJson) || packageJson.name !== 'twenty-sdk') {
      throw new CliError({
        code: 'TOOLING_UNSUPPORTED',
        message: `The twenty-sdk installation at ${packagePath} is incomplete: it has no readable twenty-sdk package.json.`,
        hint: "Reinstall the app's dependencies (for example with yarn install), then try again.",
        details: { appPath, sdkPath: packagePath },
      });
    }

    return { path: await realpath(packagePath), packageJson };
  }

  return undefined;
};

const resolveInsideSdk = ({
  resolveFromApp,
  specifier,
  sdkPath,
}: {
  resolveFromApp: NodeJS.RequireResolve;
  specifier: string;
  sdkPath: string;
}) => {
  const resolvedPath = tryResolve(resolveFromApp, specifier);

  return isDefined(resolvedPath) &&
    isInsideDirectory({ filePath: resolvedPath, directory: sdkPath })
    ? resolvedPath
    : undefined;
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
    !isPlainObject(value) ||
    !isNumber(value.protocolVersion) ||
    !isString(value.requiredNode) ||
    !isArray(value.capabilities) ||
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
  const sdk = await findInstalledSdk(appPath);

  if (!isDefined(sdk)) {
    return throwMissingSdk(appPath);
  }

  const version = isString(sdk.packageJson.version)
    ? sdk.packageJson.version
    : 'unknown';
  const details = {
    appPath,
    sdkPath: sdk.path,
    sdkVersion: version,
    supportedProtocolVersions: SUPPORTED_BUILD_PROTOCOL_VERSIONS,
  };
  const resolveFromApp = createRequire(join(appPath, 'package.json')).resolve;
  const descriptorPath = resolveInsideSdk({
    resolveFromApp,
    specifier: 'twenty-sdk/build/descriptor.json',
    sdkPath: sdk.path,
  });

  if (!isDefined(descriptorPath)) {
    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message: `twenty-sdk ${version} in this app has no build API (twenty-sdk/build).`,
      hint: UPGRADE_SDK_HINT,
      details,
    });
  }

  const descriptor = parseDescriptor(await readJsonObject(descriptorPath));

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

  if (isNonEmptyArray(missingCapabilities)) {
    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message: `twenty-sdk ${version} does not support ${missingCapabilities.join(', ')}.`,
      hint: UPGRADE_SDK_HINT,
      details: { ...details, missingCapabilities },
    });
  }

  const nodeRequirement = checkNodeRequirement({
    version: process.versions.node,
    range: descriptor.requiredNode,
  });

  if (nodeRequirement === 'invalid') {
    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message: `twenty-sdk ${version} declares a Node requirement this CLI cannot read: ${descriptor.requiredNode}`,
      hint: UPGRADE_SDK_HINT,
      details: { ...details, requiredNode: descriptor.requiredNode },
    });
  }

  if (nodeRequirement === 'unsatisfied') {
    throw new CliError({
      code: 'NODE_VERSION_UNSUPPORTED',
      message: `twenty-sdk ${version} needs Node ${descriptor.requiredNode}; this is Node ${process.versions.node}.`,
      hint: 'Switch to a supported Node version, then try again.',
      details: { ...details, requiredNode: descriptor.requiredNode },
    });
  }

  const buildEntryPath = resolveInsideSdk({
    resolveFromApp,
    specifier: 'twenty-sdk/build',
    sdkPath: sdk.path,
  });

  if (!isDefined(buildEntryPath)) {
    throw new CliError({
      code: 'TOOLING_UNSUPPORTED',
      message: `twenty-sdk ${version} has a build descriptor but no build entry point.`,
      hint: UPGRADE_SDK_HINT,
      details,
    });
  }

  return {
    version,
    packagePath: sdk.path,
    buildEntryPath,
    protocolVersion: descriptor.protocolVersion,
    capabilities: descriptor.capabilities,
  };
};
