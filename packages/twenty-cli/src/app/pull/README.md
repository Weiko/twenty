# CLI application pull

Pull reconciles the server's application export with local definitions and a
target-bound baseline. It preserves unsupported and local-only entities, reports
overwritten local edits, and commits source changes and the new baseline as one
transaction. Source generation and translation behavior are covered by parity
and reconciliation tests. It does not require an SDK tooling entry point.

See the [app tooling overview](../README.md) for package ownership and SDK migration.

## Contract

- Source scanning stays inside the disposable CLI worker so configs containing functions are never serialized through IPC. Only the server export and report cross that boundary. Selected credentials are removed from the worker environment. App source is trusted developer code, not sandboxed code.
- The wire/export and baseline boundary check identity and envelope fields, not every metadata collection. `toPullManifest` is the single explicit assertion into the typed writers, preserving their trust in the server schema. Missing/null object and field collections are consumed with `?? []`, like the other collections. Malformed entity contents can still make reconciliation fail before writing. We do not duplicate the server's schema.
- The baseline remains an `ExportedManifest`. Reconciliation walks arrays generically without maintaining a second collection list. New collections and non-array metadata survive; protected or unreconciled definitions retain their prior baseline entries.
- Before destination writes, `assertPullSdkExports` checks the actual imports emitted by the writer against the app's SDK. This avoids rejecting an old SDK that already supports every generated file. It checks export presence, not every future config shape; typecheck remains the follow-up check.
- Temporary files and the v2 baseline live under `.twenty/cli`. Apply and pull share `createPullBaseWrite` as the serializer. Pull stages the baseline with mode 0600. The old `.twenty/pull-base.json` is untouched.
- The baseline can carry `sourceFingerprints`, a SHA-256 per app-relative source and locale file. Apply takes them before it builds, so they describe the files that were applied. Pull reports an overwritten local change when a file it rewrites or deletes no longer matches its fingerprint. Without a fingerprint it falls back to comparing the file with the writer's rendering of the baseline, which only holds for files a previous pull wrote; after an apply of hand-written files that fallback reported false overwrites. Pull carries fingerprints forward, updating the files it writes and dropping the ones it deletes.
- Ordinary I/O failures restore originals. Cancellation is checked before committing the staged plan, not halfway through it. An acknowledged successful commit wins over cancellation. The parent can forcibly kill an unresponsive worker after its grace period, so an unacknowledged result has outcome `unknown`, never a claim that rollback succeeded. Failed rollback retains backups and reports their directory; failure to clean up after a completed commit has outcome `pulled`.
- Human reporting uses CLI terminal escaping, machine reporting contains the full coverage and path lists, and gaps warn without stopping successful writes. Unknown coverage status strings remain visible. No approval prompt, dirty-tree gate or new merge algorithm is introduced.

Translation string extraction uses the CLI's TypeScript parser. Traversal, static-string rules, whitespace normalization and deduplication are checked against the SDK reference by parity tests. It does not depend on ts-morph or load parser tooling for help and command discovery.

Current server exports have `files: []`. Nonempty source/dependency-file exports remain unsupported and are refused, so restoring package files or checking newly restored dependency pins is not claimed here. Pull does not generate the typed client or write logic-function/front-component source. Export responses retain the transport's 16 MiB cap. No live workspace write is part of pull.

Tests cover writers, planning and reconciliation. Command tests build the actual Vite worker, exercise an authoring-only SDK, local mock HTTP, credentials/output isolation, SDK export refusal and forced termination after the first destination write. The repository SDK tests cover canonical generated definitions, nested coverage, translation preservation, target mismatch, overwrite reporting and rollback.
