# Twenty CLI

The command line for [Twenty](https://twenty.com).

This CLI is in development. It supports saved connections, browser/API-key authentication, raw API requests, opening the workspace in a browser, metadata inspection, record reads, creating an app from a template, local app builds and typechecks, advisory app previews, and applying a development app to a workspace or uninstalling it. Run `twenty commands` for the available commands. To publish an app or develop in watch mode, keep using the CLI in [twenty-sdk](https://www.npmjs.com/package/twenty-sdk) for now.

## Diagnose your setup

```bash
twenty doctor
twenty doctor --remote staging --path ./my-app --json
twenty doctor --offline
```

`doctor` checks the running CLI and Node version, executable ownership and precedence on PATH, configuration, the selected connection, and an app's installed SDK descriptor. It works without an app or saved remote; unavailable optional checks are marked `skipped`. Use `--path` to require a specific app. PATH inspection does not execute binaries or inspect shell aliases, functions or command caches; package-manager wrappers whose owner cannot be determined are reported as unknown.

By default it sends one read-only request to the selected workspace's metadata endpoint to check access. This does not prove access to every object or app operation. `--offline` disables network requests. Doctor never imports app or SDK code, builds an app, installs packages, repairs files, or refreshes credentials. An expired OAuth access token skips the network check: it produces a warning when a refresh token is saved (renewal remains unverified), or a failure when there is none. Renew through `twenty auth status` for the same remote, or sign in again.

Each check has an `id`, `status` (`pass`, `warning`, `fail`, or `skipped`), message, and optional code, hint and details. Failed checks exit 1 with `DOCTOR_FAILED`; JSON includes the checklist in `error.details.checks`. Otherwise exit 0, with the same checklist in `data.checks`, including warnings and skipped checks. Human output includes the full checklist in either case. Ctrl+C exits 130. Output omits credentials, server response bodies and user identity information, but includes local paths and the selected API URL.

## Open the workspace

```bash
twenty open
twenty open settings/applications
twenty open --remote staging --url-only --json
```

`open` asks the selected workspace for its web address, which is its custom domain when one is enabled and its subdomain otherwise. It then opens that address, or a page inside it, in your default browser. The address carries no credentials, so sign in to the workspace in the browser if needed. A browser only opens in an interactive terminal: with `--no-input`, JSON output, redirected stdin or in CI, the command stops with `USAGE` (exit 2) unless `--url-only` is set, which prints the address instead. A page is a path inside the workspace; one that would lead to another site is refused with `USAGE`.

## Inspect the data model

```bash
twenty metadata object list
twenty metadata object describe companies
twenty metadata field list companies --all
twenty metadata field describe companies tier --json
```

Object arguments accept exact, case-sensitive singular or plural API names. Field arguments accept exact API names. Labels are never matched, and ambiguous names fail with `AMBIGUOUS_RESOURCE` (exit 2). Missing names return `NOT_FOUND` (exit 4).

Object describe and field list hide system fields unless `--all` is present. Field describe can inspect a named system field directly. Each field reports its own owner, independently of its object. If application names cannot be read, Custom remains identifiable and other owners are reported as unknown with a warning; ownership is not a permission check.

Inspection reads every metadata page before resolving names, so a match on an early page cannot hide an ambiguity on a later one. Each object/field traversal is capped at 10,000 items or 16 MiB of node data; exceeding either limit fails instead of returning incomplete metadata. Requests use the selected connection and fetch live metadata on every invocation. Human output shows labels, constraints, options and relationships; JSON also preserves IDs, universal identifiers, settings and relationship endpoints.

## Read records

```bash
twenty data list companies --limit 20
twenty data list companies --filter 'employees[gte]:5000' --order-by 'employees[DescNullsLast]'
twenty data get people <id> --json
twenty data list people --all --format ndjson
```

These commands resolve the same exact singular/plural API names as metadata inspection, including custom objects, and reuse the selected connection. They require access to object metadata as well as the records. `data get` reads one record with one level of related records; it does not recursively expand or paginate relations.

`data list` reads one page by default, with a default `--limit` of 50 and a maximum of 200. `--cursor` passes the opaque REST `starting_after` cursor. `--filter` and `--order-by` pass REST expressions unchanged; server ordering and its ID tie-breaker are preserved. Every result includes page information, and human output shows a next-page command. Pagination is not a database snapshot; concurrent writes can change results or totals during traversal.

`--fields name,employees` selects human table columns only. Tables shorten cells longer than 60 characters and display absent values as `-`. JSON and NDJSON retain full records, including composite values and relation identifiers.

`--all` reads every remaining page, including when starting from `--cursor`. Human/JSON results are limited to 10,000 records and 16 MiB of serialized payload; human tables are also bounded. Exceeding a limit returns `RESULT_LIMIT_EXCEEDED` (exit 2), with no partial success. Every HTTP response is separately limited to 16 MiB, including in NDJSON mode.

Use explicit `--format ndjson` for larger traversals. It emits numbered `start`, `record`, page `progress`, and terminal `result`/`error` events, reading one page at a time and waiting for stdout when the reader is slow. `resumeCursor` advances only after a complete page has been written. After a partial page or a failure, resume with the last reported cursor and the same filter/order; records from the partial page may repeat. With no completed page, use the original cursor or restart without one. A stream without a terminal event is incomplete. Without `--all`, NDJSON still reads only one page.

## Create an app

```bash
twenty app init my-app
twenty app init billing --path ./apps/billing --display-name Billing --json
```

`app init` creates a new app from the template bundled with this CLI, the same template `create-twenty-app` uses, with fresh universal identifiers and `twenty-client-sdk`, `twenty-sdk` and `twenty-ui` pinned to the exact version the CLI was built with. It needs no installed SDK, saved remote or network access, and it only writes files: it does not install dependencies, create a Git repository, start a server, sign in or sync anything. The next steps it prints, and returns as `data.nextSteps` in JSON, cover the rest, and name the remote when you pass `--remote`.

The name must be a valid npm package name, otherwise the command fails with `INVALID_APP_NAME` (exit 2). The app is created in `./<name>` unless `--path` says otherwise; `--display-name` and `--description` set what Twenty shows. The target must not exist yet or be an empty directory; anything else fails with `APP_PATH_UNAVAILABLE` (exit 6) and nothing is written. The template is rendered in a hidden sibling directory and moved into place only after every placeholder was filled, so a failure or Ctrl+C does not leave a half-created app behind. An existing empty directory is filled with create-only writes, so a file that appears there meanwhile is never overwritten.

New apps declare `engines.twenty` as `>=` the template release version. The server
checks this range against the workspace's completed upgrade version on apply.
Upgrade the workspace before deploying a newer template, including during local
development. Adjust the range only after testing the app against older versions.

## Build and check an app

```bash
twenty app build
twenty app typecheck
twenty app build --path ./apps/billing --json
```

These commands run inside an app project: the nearest folder, from the current one upwards, whose `package.json` depends on `twenty-sdk`. Pass `--path` to choose another app. In a folder that contains several apps, `--path` is required, and the error lists them.

The CLI builds with the app's own installed `twenty-sdk`, not a copy of its own, through the SDK's `twenty-sdk/build` API. Before loading any SDK code it reads `twenty-sdk/build/descriptor.json` and checks the protocol version, the capabilities and the Node version the SDK needs. An app without `twenty-sdk` installed fails with `SDK_NOT_INSTALLED`; an SDK without the build API, or with an incompatible protocol, fails with `TOOLING_UNSUPPORTED`; a Node version the SDK does not support fails with `NODE_VERSION_UNSUPPORTED`. The CLI never installs packages or falls back to another SDK. Yarn Plug'n'Play is not supported; use `nodeLinker: node-modules`. TypeScript configuration and project-reference errors fail the build: an app created by an older `create-twenty-app` whose `tsconfig.json` references `tsconfig.spec.json` reports `TS6305` for every source file until that `references` entry is removed.

The SDK runs in a separate worker process. That process does not receive the CLI's connections or credentials: `TWENTY_API_URL`, `TWENTY_API_KEY`, `TWENTY_REMOTE` and every `TWENTY_*` token, key, secret or password variable are removed from its environment. Anything the app or the SDK prints is reported as a `PROJECT_OUTPUT` diagnostic instead of mixing with the CLI's output, and an app that exits the process fails with `WORKER_FAILED`. This separates output and process state; it is not a sandbox for untrusted code.

`app build` compiles the app into a temporary snapshot, reports its files with their upload roles, sizes and SHA-256 checksums, the content hash and the manifest, then deletes the snapshot. Nothing is uploaded or kept. `app typecheck` checks the project without writing files. Build and type errors exit with 1, as `BUILD_FAILED` or `TYPECHECK_FAILED`, with the SDK's diagnostics in `details.diagnostics`. Ctrl+C cancels the SDK operation and exits with 130; a worker that does not stop within a few seconds is killed.

## Preview app changes

```bash
twenty app plan --remote dev
twenty app plan --path ./apps/billing --no-delete --json
```

`app plan` builds once with the project's SDK, releases the temporary snapshot, then requests the server's metadata preview with `dryRun: true`. It uses the usual connection selection and requires the server's `APPLICATIONS` permission. The server enforces authorization, ownership and manifest/version compatibility. No registration, installation, upload or metadata synchronization is performed, and planning never advances a pull base. The local build can generate app artifacts, just as `app build` does.

Plans are advisory, with `advisory: true` in JSON. They are not saved approvals: remote changes can alter what a later apply does. A missing owned application registration returns `PLAN_UNAVAILABLE` (exit 1). Register the app with `twenty app apply --create`, then plan again.

Entities missing from source are included as deletions by default. `--no-delete` passes `inferDeletionFromMissingEntities: false` to the preview. Human output lists every action, identifies object/field deletions that would remove stored data, and shows the opt-out hint. JSON includes action details and counts. Application-variable values, including previous values in updates, are redacted from all plan actions regardless of their `isSecret` setting. A plan exceeding 10,000 actions or the transport's 16 MiB response limit fails instead of displaying an incomplete preview.

## Apply an app

```bash
twenty app apply --remote dev
twenty app apply --create --json
twenty app apply --no-delete
```

`app apply` builds the app once with the project's SDK and keeps that build's snapshot until it finishes, so the files it uploads are the ones it built. It then asks the workspace for a fresh preview, shows it, and applies it: it installs the development app if needed, uploads the snapshot files, synchronizes the manifest, and regenerates the app's typed API client. It needs the server's `APPLICATIONS` and `UPLOAD_FILE` permissions.

- **New apps.** An app without a registration needs `--create`, or a yes at the prompt in an interactive terminal. The CLI then registers the app (the server also requires `API_KEYS_AND_WEBHOOKS` for this), installs it, and previews it before uploading anything. Without approval it stops with `CREATE_REQUIRED` (exit 2). The registration's client secret is never requested.
- **Deletions.** Entities missing from source are deleted by default, as in `app plan`; `--no-delete` keeps them and is sent to both the preview and the sync. Object and field deletions permanently delete stored data, so they need `--yes` or a yes at the prompt. Otherwise the command stops with `CONFIRMATION_REQUIRED` (exit 2) before changing anything. `--yes` never changes which entities are deleted.
- **Uploads.** File bytes go straight to the upload URLs the server returns, without the CLI's credentials. Each file is checked against the build's size and SHA-256 before anything is uploaded.
- **Pull baseline.** After an acknowledged sync, the CLI fetches the workspace ID and fresh application export, then atomically records `.twenty/cli/pull-base.json`. It is bound to the normalized API URL, workspace UUID and app UUID. The legacy SDK base at `.twenty/pull-base.json` is untouched. JSON reports `pullBase: "recorded"`, `"failed"` or `"unsupported"`; only a recorded base adds `pullBase` to `completedPhases`. Invalid exports or file-write errors preserve the prior base, warn with `PULL_BASE_NOT_RECORDED`, and allow client generation to continue. A server without the export API reports `"unsupported"` without a warning on every apply. The export is recorded as the server sent it; collections it lacks are read as empty by pull. Cancellation before the base is committed exits 130 with `outcome: "applied"` and `phase: "pullBase"`. The baseline prepares for the forthcoming CLI `app pull` command.
- **Typed client.** After the sync, the CLI fetches the app's GraphQL schema from the workspace and the project's SDK regenerates the client in the app's own `node_modules/twenty-client-sdk` (`clientGeneration: "generated"`). It is skipped with a `CLIENT_NOT_GENERATED` warning when the SDK cannot generate clients or when the app has no `node_modules/twenty-client-sdk` of its own, as in a hoisted workspace. A symlinked client package is followed and its target rewritten, so don't apply two apps that share one client package at the same time.
- **Failures.** A failed apply reports `details.phase`, `details.completedPhases` and `details.outcome`: `not-started` when the failing step changed nothing, `partial` when some files were uploaded, `unknown` when a request was sent but its effect is not known, such as a failed or interrupted sync, and `applied` when the sync succeeded but baseline recording was cancelled or client generation failed. Earlier steps, like a new registration, stay done. There is no rollback and no automatic retry: run `twenty app plan` to see where the workspace stands, then apply again. After `applied`, the workspace has the new version but the client files may be incomplete: fix the problem, then run `twenty app apply` again, which repeats the preview, upload and sync before regenerating the client. Ctrl+C exits with 130 and reports the step it interrupted.

The preview is advisory: remote changes made between the preview and the sync can change what the sync does. Remote changes between the acknowledged sync and the export can also enter the saved baseline without appearing in local source; this is not an atomic server snapshot of the sync. Planning, a failed sync, or a sync with an unknown outcome never advances the baseline.

## Uninstall an app

```bash
twenty app uninstall --remote dev
twenty app uninstall --yes --json
twenty app uninstall --universal-identifier <id> --yes
```

`app uninstall` builds the app to find its universal identifier, checks that the app is installed on the target and that the workspace allows uninstalling it, then uninstalls it. `--universal-identifier` skips the build, so an app whose source no longer builds can still be uninstalled. It needs the server's `APPLICATIONS` permission.

Uninstalling runs the app's uninstall hook and deletes everything the app owns, including its objects, fields and their data. It always needs `--yes`, or a yes at the prompt in an interactive terminal; otherwise it stops with `CONFIRMATION_REQUIRED` (exit 2) before changing anything. An app that is not installed returns `APP_NOT_INSTALLED` (exit 4), and one the workspace does not allow to uninstall returns `APP_NOT_UNINSTALLABLE` (exit 6).

The app's registration is kept, so `twenty app apply` can install it again without `--create`. Failures report `details.phase`, `details.completedPhases` and `details.outcome`, as for apply: an uninstall request that fails after the server received it, or is interrupted with Ctrl+C, has an `unknown` outcome. Running the command again reports `APP_NOT_INSTALLED` once the app is gone. `--universal-identifier` accepts any UUID casing and sends the canonical lowercase form.

## Output

Commands print readable text by default. With `--json`, a command prints exactly one JSON document on stdout, including when it fails:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "command": "version",
  "data": {
    "version": "0.3.0",
    "node": "24.9.0",
    "platform": "darwin",
    "arch": "arm64"
  },
  "warnings": []
}
```

A failure has `"ok": false` and an `error` object with a stable `code`, a `message`, and sometimes a `hint` and `details`.

Exit codes:

| Code | Meaning                             |
| ---- | ----------------------------------- |
| 0    | Success                             |
| 1    | Failure                             |
| 2    | Usage error or missing confirmation |
| 3    | Authentication or permission denied |
| 4    | Not found                           |
| 5    | Partial failure                     |
| 6    | Conflict                            |
| 130  | Cancelled                           |

## Development

```bash
npx nx build twenty-cli
node packages/twenty-cli/dist/cli.cjs --help
```

The app build tests also build a fixture app with the repository SDK, so build it first:

```bash
npx nx build twenty-sdk
npx vitest run --root packages/twenty-cli
```
