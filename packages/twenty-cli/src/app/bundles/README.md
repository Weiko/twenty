# Bundles and snapshots

The CLI owns application bundling and immutable snapshot lifecycle. The internal
`bundleSnapshot` worker request builds and holds or releases a snapshot under
`.twenty/cli/snapshots/build-*`. The [typechecker](../typecheck/README.md) uses the
app's own TypeScript compiler. Build, plan, apply and uninstall use this pipeline.
Worker requests are internal, not a public API or a way to bypass build checks.

See the [app tooling overview](../README.md) for package ownership and the
temporary legacy pipeline.

## Preserved behavior

Logic functions use the same ESM/CJS banner, external modules and define stubs.
Front components use the same JSX wrappers, remote-DOM transformation, optional
preact aliases, CSS injection, comment stripping, shared dependency export probes
and shims. The app's translation catalogs are baked into the bundles with the
same global key.

Source and dependency files, public and generated assets, README selection and
manifest checksum updates follow the SDK. Snapshot copies dereference symlinks.
The upload artifact list retains the SDK's roles, byte sizes and SHA-256 hashes;
manifest checksums keep their original algorithms. README and source maps are
copied/generated but are not upload artifacts, as in the SDK. The content hash
combines the sorted artifact paths, roles and hashes with the exact manifest
bytes.

Each build has its own directory and lease. Release removes only a snapshot held
by that worker. Failed and cooperatively cancelled builds remove their temporary
directory. Forced worker termination can leave a snapshot behind, as with the
SDK. Cleanup never removes legacy output or another build's snapshot.

## CLI adaptations

- Source loading, manifest generation, translations and filesystem helpers are
  shared with the other CLI app operations. The [dev session](../dev/README.md)
  observes the build's inputs and retains immutable copies for remote apply.
- The define stub reads `twenty-sdk/define` from the app's installed SDK instead
  of importing the SDK's own source barrel. Its factory/plain-data/proxy
  partition and emitted JavaScript are unchanged. This keeps runtime constants
  aligned with the SDK the app actually uses, without shipping SDK tooling.
- `sharp` is optional and resolved from the app. It is not a CLI dependency.
  When unavailable, cover generation produces the existing warning and the
  build continues. When available, the algorithm is unchanged. Vite embeds the
  original backdrop PNG as a data URI so it works in the standalone package.
- `compileApplication` runs the CLI typecheck after bundling, in the SDK's
  existing order. Both parity pipelines run their real typecheck phase with the
  same compiler; the CLI resolves it from the app.
- Workers run from the selected app directory, so invoking the CLI from a
  parent or nested directory produces the same bundle paths, bytes and hashes.
  SDK parity references run from the app root as well.
- Snapshot storage moves to `.twenty/cli/snapshots`. Upload validation accepts
  both this directory and `.twenty/snapshots`, retaining the existing path and
  per-file hash checks. Neither producer can upload from sibling folders.
- The internal worker reuses the source SDK gate, credential filtering, output
  capture, cancellation and held-snapshot release flow, and stops esbuild after
  building. SDK public commands continue using the same worker lifecycle.
- Types use the existing `ToolingResult` contract. Test imports and formatting
  follow CLI conventions; copied explanatory comments are omitted, except those
  inside generated JavaScript, whose bytes are preserved for parity.

## Verification

After building shared, SDK and UI dependencies, from `packages/twenty-cli`:

```bash
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts --maxWorkers=1 src/app/snapshots src/app/bundles src/app/__tests__/resolve-snapshot-directory.spec.ts src/commands/app/__tests__/app-real-sdk.spec.ts
```

The parity suite builds all five repository fixtures and a fresh CLI-created app
through the SDK reference and the production CLI worker. The app has a copy of
the real authoring SDK without its build/CLI exports or implementation files.
Successful builds have identical manifests, artifact roles/paths/sizes/hashes
and content hashes. The invalid fixture fails in both pipelines. The fresh
CLI template's test setup also typechecks with an authoring-only SDK. The parity
fixture excludes Vitest configuration files to keep its build comparison focused
on application source, including the test setup.

Only build IDs/directories and JSON-omitted `undefined` properties are normalized
in snapshot comparisons. File bytes, including the manifest, are exact except
source-map `sources`: real paths are resolved against each map's directory to
account for the extra `cli` path segment. Virtual plugin source names remain
unchanged. Map contents and mappings are otherwise compared as-is.

Additional tests cover optional covers, project SDK constants, baked translations
and CSS, README selection, immutable symlink copies, concurrent snapshots,
release ownership, failed/cancelled builds and failed snapshot consumers. The
existing build/apply contract runs with both SDK and CLI snapshots against a
local HTTP fixture, including uploads, sync, pull-base recording, release and
client generation through the respective SDK or CLI wrapper. It does not contact
a live Twenty workspace.
