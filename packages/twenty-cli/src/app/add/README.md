# App definition scaffolding

The four templates retain the SDK's definition shapes, name-field reference,
function handler, example triggers, component markup, directories and filename
normalization. `add-template-parity.spec.ts` bundles the repository SDK as an
oracle and compares the generated source, normalizing random UUIDs while
preserving their reuse. It covers every field type and both runtime templates.
The CLI reuses its existing kebab-case helper and the label helper already used
by app init. It never imports SDK tooling.

## Contract

- `twenty app add [entity]` accepts `object`, `field`, `logic-function` and
  `front-component`. A human terminal can supply omitted values interactively.
  JSON, CI, redirected stdin and `--no-input` never prompt; missing required or
  inapplicable options exit 2. Optional labels and field settings retain SDK
  defaults.
- `--path` selects an app, like the other CLI app commands. Files go under the
  selected app's `src/objects`, `src/fields`, `src/logic-functions` or
  `src/front-components`. Custom output directories are not supported.
- Parent and relation endpoint identifiers must be valid universal UUIDs,
  replacing the old `fill-later` placeholders. No workspace lookup verifies
  ownership or existence. Relations still require reviewing both endpoints;
  this generator creates only the requested standalone field.
- Node's `randomUUID` creates version 4 identifiers. The existing CLI TypeScript
  printer escapes authored strings, fixing the SDK template's invalid source
  when labels or descriptions contain quotes, backslashes or line breaks.
- App discovery, SDK compatibility and application identity reuse the CLI's
  worker boundary. Identity loading evaluates trusted app code in a disposable
  worker; it is not a security sandbox. The command makes no workspace requests
  and does not require authentication.
- Destination paths reuse pull's containment and symlink checks. A fully staged
  file is linked exclusively into place, so an existing or concurrently created
  destination is never replaced. Cancellation before that link removes the
  staged file; a successful link wins over late cancellation. Cleanup failure
  after success warns and reports the remaining temporary directory. Empty
  parent directories can remain after failure or cancellation. Exclusive atomic
  creation requires a filesystem supporting hard links; unsupported filesystems
  fail instead of falling back to a potentially partial destination write.
- JSON reports app-relative `createdPaths`. There is no overwrite mode and no
  editing or registration of existing definitions. Object view, layout and menu
  companions, plus the SDK's other entity generators, are deferred.

These are starter definitions, not a deployment validator. Review type-specific
settings, relation endpoints, handlers and components, then build and plan the
app. Successful generation does not imply the server will accept the metadata.
