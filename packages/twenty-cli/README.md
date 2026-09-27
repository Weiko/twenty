# Twenty CLI

The command line for [Twenty](https://twenty.com).

This CLI is in development. It supports saved connections, browser/API-key authentication, raw API requests and metadata inspection. Run `twenty commands` for the available commands. For app development, keep using the CLI in [twenty-sdk](https://www.npmjs.com/package/twenty-sdk).

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
