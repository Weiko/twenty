# Twenty CLI

The command line for [Twenty](https://twenty.com).

This CLI is in development. It supports saved connections, browser/API-key authentication, raw API requests, metadata inspection, record reads, and local app builds and typechecks. Run `twenty commands` for the available commands. To upload, sync or publish an app, keep using the CLI in [twenty-sdk](https://www.npmjs.com/package/twenty-sdk) for now.

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

## Build and check an app

```bash
twenty app build
twenty app typecheck
twenty app build --path ./apps/billing --json
```

These commands run inside an app project: the nearest folder, from the current one upwards, whose `package.json` depends on `twenty-sdk`. Pass `--path` to choose another app. In a folder that contains several apps, `--path` is required, and the error lists them.

The CLI builds with the app's own installed `twenty-sdk`, not a copy of its own, through the SDK's `twenty-sdk/build` API. Before loading any SDK code it reads `twenty-sdk/build/descriptor.json` and checks the protocol version, the capabilities and the Node version the SDK needs. An app without `twenty-sdk` installed fails with `SDK_NOT_INSTALLED`; an SDK without the build API, or with an incompatible protocol, fails with `TOOLING_UNSUPPORTED`; a Node version the SDK does not support fails with `NODE_VERSION_UNSUPPORTED`. The CLI never installs packages or falls back to another SDK. Yarn Plug'n'Play is not supported; use `nodeLinker: node-modules`.

The SDK runs in a separate worker process. That process does not receive the CLI's connections or credentials: `TWENTY_API_URL`, `TWENTY_API_KEY`, `TWENTY_REMOTE` and every `TWENTY_*` token, key, secret or password variable are removed from its environment. Anything the app or the SDK prints is reported as a `PROJECT_OUTPUT` diagnostic instead of mixing with the CLI's output, and an app that exits the process fails with `WORKER_FAILED`. This separates output and process state; it is not a sandbox for untrusted code.

`app build` compiles the app into a temporary snapshot, reports its files with their upload roles, sizes and SHA-256 checksums, the content hash and the manifest, then deletes the snapshot. Nothing is uploaded or kept. `app typecheck` checks the project without writing files. Build and type errors exit with 1, as `BUILD_FAILED` or `TYPECHECK_FAILED`, with the SDK's diagnostics in `details.diagnostics`. Ctrl+C cancels the SDK operation and exits with 130; a worker that does not stop within a few seconds is killed.

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
