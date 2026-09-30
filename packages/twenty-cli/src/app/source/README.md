# App source loading

This is the CLI-owned foundation for app pull and later CLI-owned builds. It now powers `twenty app pull`. Existing build, typecheck and client generation still use the project's SDK build API.

The extraction and scanning code was ported from twenty-sdk at `f50091b27cc7dc883d6f2e22a9966b8a7fad201e`, under `src/cli/utilities/build/manifest`, `src/cli/utilities/build/common/conditional-availability`, `src/cli/utilities/pull/scan-project-source-files.ts`, `src/cli/utilities/file/application-source-globs.ts` and `src/application-build/pull/read-application-identity.ts`. SDK source remains unchanged. Compare these paths when bringing in SDK fixes during the migration.

## Boundary

`readAppIdentity` checks the installed SDK without importing it, then evaluates the application's definition in a disposable CLI worker. Source is trusted executable developer code. The child contains exits, captures bounded output and can be killed on cancellation; it is not a filesystem or network sandbox. Selected workspace credentials are removed from its environment by the existing worker launcher.

`scanProjectSourceFiles` stays inside the worker. Its configs may contain functions and React components, so future reconciliation must run in that same worker rather than send configs over JSON IPC. Only the application UUID, display name and diagnostics cross the identity boundary.

## Compatibility

- The app supplies its own `twenty-sdk`, version `>=1.23.0`, with resolvable `twenty-sdk/define` and `twenty-sdk/front-component` entry points. The installed SDK's Node requirement is checked. No `twenty-sdk/build` export or build descriptor is needed.
- There is no upper SDK version cap. Every evaluated definition must return the public `ValidationResult` shape: boolean `success`, object `config`, string-array `errors`, and optional string-array `warnings`. An incompatible shape fails with `SDK_SOURCE_UNSUPPORTED`. This validates the loader contract, not every future SDK behavior.
- The CLI owns esbuild, its TypeScript parser and tinyglobby as runtime dependencies. These load only for source operations. The app does not need to install TypeScript for source loading. A future typecheck operation will use the project's compiler separately.
- The pull writer separately checks the authoring exports its generated files use; this loader floor does not establish that every SDK since 1.23 supports all current manifest collections.

## Preserved behavior

Source discovery covers root and nested `.ts`/`.tsx` files, excluding declarations, `node_modules`, `dist` and `.twenty`. Only a direct top-level `export default defineX(...)` is classified as a definition. Aliases, namespace calls and variable re-exports remain unsupported. Helpers reserve their paths without being evaluated on their own; imported helpers run as dependencies of a definition.

Definitions are bundled using the app's tsconfig and imports, then evaluated with a require rooted at the app. React resolves from the app. UI and generated-client imports keep the SDK's extraction stubs; these are not working UI or client implementations. CSS imports are ignored and conditional-availability expressions use the existing transformation.

An ordinary extraction failure marks a scanned definition unreadable, retaining its path so reconciliation can avoid overwriting it. SDK validation errors still leave the config available, as in the old scanner. Reading identity evaluates only application definitions, rejects duplicate or invalid application UUIDs, and returns `null` when no application is declared.

Intentional additions are the static SDK gate, validation-result shape checks, and cancellation checks between files. Detection still uses the function name rather than its import origin: a local helper named `defineObject`, for example, must be renamed if it returns an incompatible shape. Such a mismatch now fails the scan instead of leaving an unmatched config. Source rewriting and reconciliation live in the adjacent `pull` module.

## Verification

Run the source-loader, SDK-resolution and worker tests with the CLI Vitest configuration. The repository-SDK fixture requires its existing SDK/UI/shared artifacts to be built, as do the other CLI app tests. Worker tests use an authoring-only SDK without a project compiler, exercise output and credential isolation, and cover source exits and cancellation.
