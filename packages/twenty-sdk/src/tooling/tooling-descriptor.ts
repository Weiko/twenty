import {
  TOOLING_PROTOCOL_VERSION,
  type ToolingDescriptor,
} from 'twenty-shared/cli';

import packageJson from '../../package.json';

export const TOOLING_DESCRIPTOR: ToolingDescriptor = {
  protocolVersion: TOOLING_PROTOCOL_VERSION,
  sdkVersion: packageJson.version,
  requiredNode: packageJson.engines.node,
  capabilities: ['build', 'typecheck', 'releaseSnapshot'],
  fileWrites: {
    build: ['.twenty/snapshots/**'],
    typecheck: [],
    releaseSnapshot: ['.twenty/snapshots/**'],
  },
};
