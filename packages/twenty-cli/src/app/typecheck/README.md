# Application typechecking

The CLI typechecks applications using their own TypeScript installation.
The SDK implementation is retained as a test-only parity reference; see the
[app tooling overview](../README.md) for package ownership.

The internal `typecheckSource` worker request checks an app without loading SDK
tooling. `bundleSnapshot` now runs this typecheck after bundling, in the SDK's
existing order. A failed check discards that build's snapshot. Public build,
typecheck, plan, apply and uninstall commands use this pipeline.

## Compiler ownership

The globally installed CLI resolves `typescript` from the app's `node_modules`
or a workspace ancestor. It never falls back to its own parser dependency,
`NODE_PATH` or Node's global package folders. Apps keep TypeScript in their
development dependencies; neither apps nor the SDK depend on the CLI.

Missing TypeScript returns `TYPESCRIPT_NOT_INSTALLED`. An incomplete installation,
missing compiler API or unsupported Plug'n'Play installation returns
`TOOLING_UNSUPPORTED`. Resolution reuses the CLI's existing directory, filesystem
and package-reading helpers. The resolved entry must belong to that installation.
This boundary is needed because the compiler now comes from the app instead of
being the SDK's own dependency.

TypeScript is loaded only in the child worker. Its public JavaScript compiler API
is required. The CLI uses the installed compiler's diagnostic categories and
message formatter, so diagnostics follow the project's compiler version. The CLI
parser used for source loading remains independent.

## Preserved behavior and migration

- Read the app's `tsconfig.json`, preserve its project references and force
  `noEmit: true`. Do not write JavaScript, declarations or build information.
- Configuration read/parse errors fail the check, including missing configs,
  invalid options and missing extended configs. Source diagnostics use TS codes,
  project-relative paths and one-based line and column numbers.
- Unbuilt project references fail with TS6305, including diagnostics without a
  source location. Build the referenced projects separately; this check does not
  build them or silently ignore their errors.
- Build warnings remain alongside typecheck diagnostics. Failure never holds a
  snapshot for upload, and cleanup preserves unrelated snapshots.
- Check cancellation before and after the synchronous compiler work. A busy
  compiler cannot process IPC cancellation mid-call; the existing worker grace
  period and forced termination remain the fallback.

The SDK's programmatic build API already enforces configuration errors. Its
legacy watch typecheck plugin parses only source-located `tsc` output and can
miss configuration or project-reference errors. Moving to the CLI pipeline will
require fixing those configurations. Different project and SDK compiler versions
can also produce different diagnostics; align versions when comparing results.
The SDK package keeps its existing behavior during migration.

New `twenty app init` projects use the CLI test-harness overlay and no longer
import `twenty-sdk/cli`. The separate `create-twenty-app` package still has its
legacy test harness. Its compatibility must be handled before removing the SDK
CLI export; existing app maintainers also need to migrate their own harnesses.
Neither harness should import a global CLI package as a library.

## Verification

From `packages/twenty-cli`, after building the shared and SDK dependencies:

```sh
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/app/typecheck src/app/snapshots --maxWorkers=1
```

The typecheck suite compares the unmodified SDK reference, the CLI port and the
production worker with the same compiler. It also tests absent and hoisted
compilers, global-path fallback, incomplete installations and actual TypeScript
5.9.3 versus 5.7.3 behavior. The older compiler comes from the SDK's existing
ts-morph dependency for this test only, without a new CLI dependency.

Snapshot parity now runs both real typecheck phases, with no compiler bypass.
The app fixture supplies only the SDK's authoring/runtime exports. The apply
contract still exercises both snapshot producers against the local HTTP fixture.
For the fresh CLI template, parity compares successful builds with the test
setup included and Vitest configuration files excluded. The template supplied
by `create-twenty-app` remains separate from the CLI overlay.
