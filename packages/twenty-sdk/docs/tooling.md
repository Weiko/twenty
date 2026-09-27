# Local tooling protocol

`twenty-sdk/tooling` exposes the installed SDK's local operations to the Twenty CLI. It does not manage credentials, read CLI configuration, contact a workspace, prompt, print results, or exit the process. Application source is trusted executable code; run it in the CLI-owned worker to isolate incidental output and process exits.

Read `twenty-sdk/tooling/descriptor.json` before importing the SDK. It is generated from the package version and Node requirement at build time. Its protocol version is independent of SDK semver and server compatibility. Importing the tooling entry does not load TypeScript or esbuild.

```ts
import { tooling } from 'twenty-sdk/tooling';

const result = await tooling.build({ appPath: '/absolute/path/to/app' });

if (result.success) {
  try {
    // Consume result.data.manifest and result.data.files here.
  } finally {
    await tooling.releaseSnapshot({ buildId: result.data.buildId });
  }
}
```

Protocol 1 currently advertises `build`, `typecheck`, and `releaseSnapshot`. Watch, pull reconciliation, and client generation are not advertised until implemented. Check capabilities rather than inferring them from the protocol or SDK version. Types and the protocol constant are bundled from `twenty-shared/cli`; consumers do not need that private package installed.

## Results and diagnostics

Operations return `{ success: true, data, diagnostics }` or `{ success: false, error: { code, message }, diagnostics }`. Typechecking succeeds with `data: null` and emits no files. Missing or invalid TypeScript configuration is a failure, including diagnostics without a source location.

Diagnostics have `severity`, `code`, and `message`, with optional project-relative `file` and one-based `line` and `column`. Codes include TypeScript codes such as `TS2322`. Operation error codes are `INVALID_APP_PATH`, `MANIFEST_BUILD_FAILED`, `BUILD_FAILED`, `TYPECHECK_FAILED`, `CANCELLED`, `SNAPSHOT_NOT_FOUND`, and `SNAPSHOT_RELEASE_FAILED`. The CLI maps these to its public error envelope and exit codes.

Both new operations fail on TypeScript configuration and project-reference errors, including errors without a source location. The legacy builder's text parser silently ignored some of these failures; successful legacy builds do not establish that a project passes typechecking. Before migrating, run the new typecheck operation and fix its diagnostics. For `TS6305`, build the referenced TypeScript projects first, or correct references that should not be part of the app compilation. Regenerate any app-specific client types against the intended workspace and SDK. The tooling never builds referenced projects or emits declarations implicitly, so its declared file writes remain accurate.

Build and typecheck accept an optional `AbortSignal`. Cancellation is checked between asynchronous stages; synchronous TypeScript checking cannot be interrupted in-process. The CLI worker remains the boundary for immediate cancellation or app code calling `process.exit`.

## Build snapshots

A successful build returns:

- `buildId`, unique for the build, and `directory`, an absolute directory containing stable artifact bytes.
- `manifestFormat: "twenty-application"` and the opaque `manifest`. This format name identifies the existing server manifest, which has no standalone numeric schema version. The server still validates compatibility.
- `application: { universalIdentifier, name, displayName }`, with `name` taken from the app package.
- `files`, the complete uploadable artifact set, sorted by path. Each entry has a snapshot-relative POSIX `path`, app-relative `sourcePath`, `role`, byte `size`, and `sha256`.
- `contentHash`, SHA-256 of the UTF-8 JSON encoding of the sorted `{ path, role, sha256 }` entries, a newline, then the exact `manifest.json` bytes. Compare within a compatible SDK/tooling environment; this is not a server-approved plan digest.

Roles are the server's upload folder values: `built-logic-function`, `built-front-component`, `source`, `dependencies`, and `public-asset`. Sources, dependency files, and generated assets are included every time, even when unchanged. Source maps, README, and `manifest.json` may also exist in the directory; they are not extra upload targets. Existing manifest checksum algorithms remain unchanged; artifact SHA-256 is a separate transport integrity contract.

Each build writes only under a unique `.twenty/snapshots/build-*/` directory, with artifacts in `files/` and owner information in `lease.json`. It never clears another build's output or `.twenty/output`. Static files are copied as bytes, so changing a symlink target cannot mutate a retained snapshot.

Keep the owning worker alive while consuming a snapshot. `releaseSnapshot` deletes the entire directory and its lease, not just the in-memory handle. Release after apply completes or a build is superseded; retain only path/hash metadata for the applied baseline. Unknown or foreign build IDs fail without deleting files. Never release a snapshot while an upload still uses it.

Failed builds clean up their own directory. A killed worker can leave an orphan. Protocol 1 does not automatically prune other processes' directories. To remove crash leftovers manually, stop all CLI workers using that app first, then remove its `.twenty/snapshots` directory. This keeps active snapshots safe from PID reuse and cleanup races.

## Legacy commands

The SDK ships both `twenty` and the additive `twenty-sdk` alias during extraction. Existing `twenty-sdk/cli` imports remain available. Do not add the new `twenty` package as another local bin owner until a later SDK release removes only the old `twenty` name.

Legacy `app build` retains its existing typecheck implementation and error formatting. The stricter configuration checks above apply to the new tooling operations.

Help uses the invoked binary name when available. Windows command shims and wrappers that pass the underlying script path can still display `twenty` when invoked through `twenty-sdk`.
