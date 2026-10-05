# Application tooling

See [Contributing](../../CONTRIBUTING.md) for package setup and tests, and the
[command reference](../../docs/commands.md) for user-visible behavior.

The `twenty` CLI owns filesystem operations, source loading, build, typecheck,
watching, pull and deployment. Apps use `twenty-sdk` to define application
metadata and runtime behavior. They do not import or depend on the CLI, which
is normally installed globally.

| Module                                   | Responsibility                                                       |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `project`                             | Locate the app and resolve its installed SDK and Node requirements   |
| `deployment`                          | Preview metadata changes, approve them, upload snapshots and sync    |
| [source](source/README.md)               | Discover and evaluate trusted app definitions in a disposable worker |
| [manifest](manifest/README.md)           | Construct and validate metadata, compile translations                |
| [bundles](bundles/README.md)             | Build artifacts and hold immutable snapshots for consumers           |
| [typecheck](typecheck/README.md)         | Check source and configuration with the app's TypeScript compiler    |
| [client](client/README.md)               | Invoke the app's installed client SDK generator                      |
| [pull](pull/README.md)                   | Reconcile remote metadata with source and a target-bound baseline    |
| [add](add/README.md)                     | Create starter definitions without replacing existing files          |
| [dev](dev/README.md)                     | Watch build inputs and schedule builds and remote apply              |
| [exec](exec/README.md)                   | Execute an installed logic function                                  |
| [function-logs](function-logs/README.md) | Stream application function logs                                     |

The worker isolates process exits, captures bounded output, filters inherited
CLI credentials and supports cancellation. It runs trusted developer code and
is not a security sandbox. Configurations containing functions stay inside the
worker; only serializable requests, results and diagnostics cross IPC.

Snapshots retain files until their consumers finish. Uploads verify containment,
size and checksums. Pull and scaffolding stage writes before exposing them to
file watchers. Keep these guarantees when simplifying implementation details.

## SDK migration

The SDK still ships its old tooling until the separate CLI is released. Copied
algorithms are checked against SDK source by parity tests; SDK fixes affecting
both implementations need assessment in both places during this transition.
The CLI does not import the SDK's tooling APIs.

The CLI has no SDK tooling fallback or build-descriptor negotiation. Command
failure and cancellation tests inject tooling fixtures into a bundle of the
production worker; real-app tests exercise its actual compiler and bundler.
SDK source remains a test-only parity reference while old SDK tooling exists.

SDK slimming and deprecating `create-twenty-app` require a coordinated release.
The CLI template overlay already uses subprocess commands for its test harness;
existing apps and the separate scaffolder must also stop importing SDK tooling
before those exports are removed. Keep useful compiler/configuration migration
notes in the [typecheck documentation](typecheck/README.md).
