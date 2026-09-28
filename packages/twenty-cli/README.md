# Twenty CLI

The command line for [Twenty](https://twenty.com).

This CLI is in development. It supports saved connections, browser/API-key authentication, raw API requests, metadata inspection and record reads. Run `twenty commands` for the available commands. For app development, keep using the CLI in [twenty-sdk](https://www.npmjs.com/package/twenty-sdk).

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
