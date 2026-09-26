# Twenty CLI

The command line for [Twenty](https://twenty.com).

This CLI is in development and only ships `twenty version` and `twenty commands` so far. For app development, keep using the CLI in [twenty-sdk](https://www.npmjs.com/package/twenty-sdk).

## Output

Commands print readable text by default. With `--json`, a command prints exactly one JSON document on stdout, including when it fails:

```json
{"schemaVersion":1,"ok":true,"command":"version","data":{"version":"0.3.0","node":"24.9.0","platform":"darwin","arch":"arm64"},"warnings":[]}
```

A failure has `"ok": false` and an `error` object with a stable `code`, a `message`, and sometimes a `hint` and `details`.

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Failure |
| 2 | Usage error or missing confirmation |
| 3 | Authentication or permission denied |
| 4 | Not found |
| 5 | Partial failure |
| 6 | Conflict |
| 130 | Cancelled |

## Development

```bash
npx nx build twenty-cli
node packages/twenty-cli/dist/cli.cjs --help
```
