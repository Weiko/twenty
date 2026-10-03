# Manifest generation

The manifest builder constructs and validates metadata and compiles translations
for build, plan and apply. The worker evaluates definitions through
[app/source](../source/README.md); bundling and final artifact checksums belong to
[app/bundles](../bundles/README.md).

The SDK implementation remains a test-only parity reference for the default
pipeline. See the [app tooling overview](../README.md) for package ownership and
the temporary legacy pipeline.

## Preserved behavior

The builder discovers definitions and assets, derives default object fields and
permission identifiers, infers logic-function input schemas, resolves lifecycle
hooks, reads the README and validates entity relationships, identifiers, role
permissions and conditional availability. Manifests are sorted in the same order
and carry the same checksum placeholders. Bundling and final checksums belong to
the bundler.

`package.json`'s `engines.twenty` is copied unchanged into
`application.requiredServerVersionRange`, apart from the SDK's existing trim and
empty-value handling. No CLI version is substituted. Package dependency warnings
and empty-lockfile validation are preserved. The legacy warning about SDK tooling
will need revisiting when the runtime-only SDK ships.

Translation compilation reuses the locale catalog helpers already ported for
pull. It preserves the distinction between no locale directory (`undefined`)
and an empty one (`{}`), context-dependent message IDs, authored-over-compiled
precedence, orphan compiled translations, collision handling and skipped-file
warnings. It reads catalogs without rewriting them.

## CLI adaptations

- Definition discovery, detection and evaluation reuse `app/source`, including
  its shared source and ignore globs. Enum references become
  the loader's string literals; the unreachable public-assets switch case is
  omitted. The loader's existing validation-result shape check still applies.
- Source and public-asset discovery is sorted. The SDK processes files in
  tinyglobby's order, which changes between runs, so its warnings, errors and
  entity file lists can come out in a different order for the same app. The
  manifest itself was already sorted. The parity suites sort the SDK
  reference's discovery the same way, so their comparisons stay exact.
- The loader result accepts a compile-time config type, with the same runtime
  shape check. Config types are copied locally rather than importing the SDK.
  Handler parameters use `never` and return `unknown`; front components expose
  only the `name` consumed here. The builder never calls those callbacks.
- The version helper requires an explicit app path. It cannot fall back to the
  legacy CLI's process-wide execution directory.
- Filesystem reads use Node and the existing CLI `pathExists` helper. The small
  generic JSON reader preserves the SDK's thrown parse errors.
- The worker resolves the app's authoring SDK with the existing source gate,
  returns structured errors and warnings, checks cancellation between phases and
  stops esbuild before exiting. It uses the existing credential filtering,
  bounded output capture and cancellation/termination behavior. It does not hold
  a snapshot or write build state.
- Test imports use Vitest and CLI paths. Runtime behavior is otherwise ported
  unchanged; generic names and formatting follow CLI conventions.

## Verification

From `packages/twenty-cli`, after building the repository SDK, shared and UI
packages:

```bash
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts --maxWorkers=1 src/app/manifest/__tests__/manifest-parity.spec.ts
```

The suite bundles the unchanged SDK implementation as a test-only reference. It
compares manifests, entity file paths, errors and warnings for every repository
fixture and a freshly initialized app. It also exercises the production CLI
worker using a copy of the real SDK's authoring entry points without `./build`,
`./cli` or their implementation files.

Comparisons remove only JSON-omitted `undefined` properties, matching the worker
IPC boundary; arrays and diagnostics are not reordered. The invalid-app fixture
throws `Invalid UUID` in both implementations. Additional cases cover duplicate
identifiers, empty lockfiles, translations, source output and credential filtering.
The copied SDK unit tests cover individual validation and translation rules.
