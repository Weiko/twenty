# Application client generation

B5 ports `src/application-build/generate-application-client.ts` from twenty-sdk
at `85902c53835d7f2d21399118a2bdd8896d3eb53c`. The CLI owns the wrapper and calls
`replaceCoreClient` from the app's installed `twenty-client-sdk/generate`.
The generator implementation is reused, not copied into the CLI. Compare the
wrapper with the recorded SDK source and rerun parity when porting a fix.
The package manifest read reuses the CLI's `readJsonObject`: missing or malformed
JSON gets the same clear expected-package diagnostic as a wrong package name.
The remaining validation, generation and cancellation behavior follows the SDK.

The internal `generateSourceClient` worker request needs no application SDK
build entry or descriptor. Public `app apply` uses it by default. The temporary
`--legacy-sdk` fallback selects the SDK wrapper instead.

## Package and output ownership

The app must have `node_modules/twenty-client-sdk/package.json` with the expected
package name. Preserve the SDK's app-local check; do not search workspace
ancestors and overwrite a hoisted-only installation shared by other apps.
Package-manager symlinks follow the same behavior as the SDK wrapper.

Resolve `twenty-client-sdk/generate` from this package and require the entry to
belong to the same real package directory. It must export a callable
`replaceCoreClient`. This keeps the generator and the client it writes into on
the same installed version, with no fallback to the CLI's own client SDK.

The output layout remains `dist/core/generated`, `dist/core.mjs` and
`dist/core.cjs` inside that installation. Source files and the metadata client
remain unchanged. No CLI dependency is added to apps or SDK packages, and B5
adds no package dependency. Client SDK generator dependencies remain installed
in the app for now, per D6 option A. Moving them to a separate package shared
with the server is a later architectural change.

## Failure and cancellation

Preserve non-empty schema validation, absolute app-path validation and the SDK's
`CLIENT_GENERATION_FAILED` / `CANCELLED` results. Missing or incompatible local
packages fail before invoking the generator. The existing generator rejects
invalid schemas without replacing the installed bundles.

Generation is not transactional. A generator failure can leave partial changes;
the wrapper reports that failure even if cancellation was requested meanwhile.
The generator has no cancellation parameter, so the wrapper waits for it to
settle and then checks the signal. Forced worker termination can interrupt file
writes. These are the existing SDK semantics, not rollback guarantees.

## Verification

From `packages/twenty-cli`, after building the shared, SDK and client SDK:

```sh
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/app/client src/commands/app/__tests__/app-real-sdk.spec.ts --maxWorkers=1
```

Parity runs the unchanged SDK reference and the production CLI worker against
the same schema and app path, comparing every generated source file and both
compiled bundles byte for byte. Reusing the path keeps esbuild's source-path
comments identical without normalizing file contents. The app has its own client
SDK and no application SDK. The generated CommonJS client is loaded to verify
its `CoreApiClient` export.

Other cases cover a missing or hoisted-only package, invalid manifests and
schemas, missing exports, a non-callable API, selection of the app's generator,
pre-cancellation, in-flight cancellation and preserved failures/partial writes.
The existing local HTTP apply contract exercises both SDK and CLI client
generation, along with snapshot upload, synchronization, pull-base recording
and release. No live workspace is contacted.
