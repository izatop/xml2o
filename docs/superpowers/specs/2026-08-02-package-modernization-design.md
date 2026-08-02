# xml2o Package Modernization Design

## Goal

Modernize `xml2o` with the package, test, documentation, security, and release
conventions used by `gelf-client`. The published package will support ES modules
and CommonJS, keep its current API, use Bun for development and CI, and publish
through npm Trusted Publishing.

## Current State

`xml2o@0.4.13` uses Yarn 3.5.1 with a tracked zero-install cache, TypeScript
4.9.5, Tape, and a CommonJS-only TypeScript build. The repository has a tag-only
publish workflow that uses Node 18, unpinned actions, and an `NPM_TOKEN` secret.
It has no branch CI workflow, formatter, linter, enforced coverage, packed
consumer test, or Bun lockfile.

`bun audit` and `bun outdated` cannot read the Yarn lockfile. Bun 1.3.14 exits
with `UnsupportedYarnLockfileVersion` before it can inspect dependencies. The
migration must create `bun.lock` before the repository can use Bun's audit
results.

The README describes the public API but contains stale examples. In particular,
`convertString` and `convertStream` return promises while the examples treat
their results as synchronous values. The CommonJS note also names
`createString`, which the package does not export.

## Public Package Contract

The package will publish these entrypoints:

| Consumer | Package condition | File |
| --- | --- | --- |
| ES modules | `import` | `dist/index.mjs` |
| CommonJS | `require` | `dist/index.cjs` |
| TypeScript | `types` | `dist/types/index.d.ts` |

`package.json` will define `exports` for the package root and retain `main`,
`module`, `types`, and `typings` for compatible tooling.

Both module formats will export `convertString`, `convertStream`, `Node`, and
`Attribute` as named exports. CommonJS consumers will keep using properties on
the required module object:

```js
const { convertString, Node } = require("xml2o");
```

The migration will not add a default export. `sax` will remain the package's
only runtime dependency instead of being bundled. `@types/node` and `@types/sax`
will move from `dependencies` to `devDependencies` and stay out of the published
runtime dependency graph.

## Toolchain and Dependencies

The repository will remove the Yarn release, plugins, cache, configuration, and
lockfile. `packageManager` will name the Bun version used for the migration, and
`bun.lock` will become the only dependency lockfile.

The migration will update direct dependencies to current compatible releases.
It will verify the versions against the npm registry during implementation and
record the resolved graph in `bun.lock`. TypeScript 7 will use explicit ambient
types for source and tests.

Oxlint will check the TypeScript source, tests, and package scripts. Oxfmt will
format the same tracked files. The repository will use LF line endings.

## Build

The root `tsconfig.json` will contain shared strict settings and source
boundaries. `tsconfig.esnext.json` and `tsconfig.cjs.json` will type-check the
same source with their respective module semantics.

TypeScript will emit declarations into `dist/types`. Bun will build
`src/index.ts` into `dist/index.mjs` and `dist/index.cjs` with the Node target,
external packages, linked source maps, and syntax minification. The build will
clean stale output first.

A packed-package test will create a tarball, install it in a temporary consumer,
and verify:

- the tarball contains both JavaScript entrypoints, source maps, declarations,
  README, and license;
- Node can load the named exports through ESM and CommonJS;
- TypeScript resolves the published declarations;
- the package keeps `sax` as its runtime dependency and excludes development
  type packages from runtime dependencies.

## Tests and Coverage

The test suite will move from Tape to `bun:test`. Tests will cover conversion
from strings and streams, parser failures, XML text and CDATA, namespaces,
attributes, tree navigation, and query paths.

`bunfig.toml` will enable coverage, exclude test files, and require 100% lines,
functions, and statements for production code under `src`. Tests will use
temporary files or in-memory streams and will close resources they create.

**Known limitation (Bun 1.3.14):** coverage reports correctly, but configured
thresholds did not return a non-zero status below target. Keep the 100%
thresholds configured; CI must still require a visible 100% report until Bun
fixes enforcement.

The aggregate `bun run check` command will run formatting checks, linting,
source and test typechecks, unit tests, the dual build, and the packed-package
test.

## Documentation

The implementation will check the README against the source, declarations, and
packed package. It will correct stale method names, asynchronous examples,
signatures, return values, and grammar that obscures API behavior.

The installation section will show:

```sh
npm install xml2o
bun add xml2o
yarn add xml2o
```

The usage section will contain working ESM and CommonJS examples. Both examples
will await the conversion promise. The README will describe conversion from a
string and stream, node properties, attribute access, query behavior, errors,
and development commands.

The packed-package test will exercise the same import and require forms shown in
the README. Unit tests will cover the documented conversion behavior.

## Security and CI

`bun run security` will execute `bun audit` without ignored advisories or a
severity filter. The repository will fix direct dependency issues when a safe
release exists. If Bun reports a transitive advisory with no safe resolution,
the implementation report will name the package path, advisory, and available
options rather than suppressing it.

The CI workflow will run for pushes and pull requests. It will use commit-pinned
GitHub actions, minimal read permissions, Bun's frozen install, the strict audit,
and `bun run check`.

## Publishing

The Publish workflow will run for `v*` tags and accept an existing tag through
`workflow_dispatch`. It will check out the exact tag, install with Bun, run the
audit and full check, and use Node 24 with npm to publish.

npm Trusted Publishing will authenticate the publish step through GitHub OIDC.
The workflow will grant `id-token: write` and `contents: read`; it will not read
an `NPM_TOKEN` secret. `npm publish --provenance` will publish the verified
tarball metadata.

This change will not create a release tag, publish a package version, or add an
automatic version-bump workflow.

## Acceptance Criteria

- `bun ci` installs the locked dependency graph without Yarn files.
- `bun run security` completes and reports no known advisory.
- `bun test` reports and enforces 100% lines, functions, and statements for
  production source.
- `bun run build` creates the CJS, ESM, source map, and declaration artifacts.
- Packed ESM, CommonJS, and TypeScript consumers load the documented API.
- The packed manifest lists `sax` as its only runtime dependency and keeps
  `@types/node` and `@types/sax` in `devDependencies`.
- `bun run check` passes from a clean checkout.
- CI runs the audit and full check on pushes and pull requests.
- Publish uses npm Trusted Publishing and no registry token secret.
- The README documents npm, Bun, and Yarn installation plus ESM and CommonJS
  usage with correct asynchronous behavior.

## Out of Scope

- changing XML parsing behavior or public method names;
- adding a default export or browser bundle;
- publishing a new npm version;
- automatic semantic-version selection or GitHub Release creation.
