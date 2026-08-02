# xml2o Package Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a documented, audited, fully tested dual CJS/ESM `xml2o` package
with Bun tooling and npm Trusted Publishing.

**Architecture:** Bun manages dependencies, runs tests, and bundles one Node.js
entrypoint per module format. TypeScript checks CJS and ESM source semantics and
emits shared declarations. Unit tests cover source behavior while a packed
consumer validates the published contract.

**Tech Stack:** Bun 1.3.14, TypeScript 7.0.2, Sax 1.6.1, `bun:test`, oxlint
1.76.0, oxfmt 0.61.0, Node.js 24, GitHub Actions, npm OIDC.

## Global Constraints

- Preserve the named exports `convertString`, `convertStream`, `Node`, and
  `Attribute`.
- Preserve promise-based conversion and current XML parsing behavior.
- Keep `sax` as the only production dependency.
- Keep `@types/node` and `@types/sax` in `devDependencies`.
- Build `dist/index.mjs` and `dist/index.cjs` with Bun and linked source maps.
- Emit declarations into `dist/types` with TypeScript.
- Require 100% lines, functions, and statements under `src/**`.
- Run `bun audit` without filters or ignored advisories.
- Keep GitHub Action references pinned to full commit hashes.
- Do not change package version, create a tag, or publish to npm.

---

### Task 1: Replace Yarn and Tape with the Bun Development Baseline

**Files:**

- Modify: `package.json`
- Modify: `.gitignore`
- Create: `bun.lock`
- Create: `bunfig.toml`
- Create: `.editorconfig`
- Create: `.oxlintrc.json`
- Create: `.oxfmtrc.json`
- Create: `test/index.test.ts`
- Create: `test/tsconfig.json`
- Delete: `.yarn/**`
- Delete: `.yarnrc.yml`
- Delete: `yarn.lock`
- Delete: `index.spec.xml`
- Delete: `src/index.spec.ts`

**Interfaces:**

- Consumes: `convertString(xml: string): Promise<Node>` and
  `convertStream(stream: NodeJS.ReadableStream): Promise<Node>`.
- Produces: Bun scripts `test`, `test:typecheck`, `lint`, `fmt`, `security`, and
  a Bun lockfile with `sax` as the only production dependency.

- [ ] **Step 1: Add Bun tests for the existing public conversion contract**

Create `test/index.test.ts` with Bun assertions and in-memory streams:

```typescript
import { describe, expect, test } from "bun:test";
import { Readable } from "node:stream";
import { Attribute, Node, convertStream, convertString } from "../src";

const xml = '<root type="thing"><item id="1">one</item><item id="2"><![CDATA[two]]></item></root>';

describe("conversion", () => {
    test("converts strings", async () => {
        const node = await convertString(xml);
        expect(node).toBeInstanceOf(Node);
        expect(node.query("item")).toHaveLength(2);
        expect(node.query("item")[0]?.getAttributeNode("id")).toBeInstanceOf(Attribute);
    });

    test("converts readable streams", async () => {
        const node = await convertStream(Readable.from([xml]));
        expect(node.getAttribute("type")).toBe("thing");
        expect(node.text).toContain("onetwo");
    });
});
```

- [ ] **Step 2: Run the Bun test command and capture RED**

Run:

```bash
bun test
```

Expected: FAIL before dependency migration because Bun cannot load the Yarn
lockfile and the test dependencies have not been installed through Bun.

- [ ] **Step 3: Replace package metadata and scripts**

Set the dependency sections to:

```json
"dependencies": {
    "sax": "^1.6.1"
},
"devDependencies": {
    "@types/bun": "^1.3.14",
    "@types/node": "^26.1.2",
    "@types/sax": "^1.2.7",
    "oxfmt": "^0.61.0",
    "oxlint": "^1.76.0",
    "rimraf": "^6.1.3",
    "typescript": "7.0.2"
},
"packageManager": "bun@1.3.14"
```

Add the baseline scripts:

```json
"test": "bun test",
"test:watch": "bun test --watch",
"test:typecheck": "tsc -p test/tsconfig.json",
"lint": "oxlint .",
"lint:fix": "oxlint --fix .",
"fmt": "oxfmt .",
"fmt:check": "oxfmt --check .",
"security": "bun audit"
```

- [ ] **Step 4: Add Bun, formatter, linter, and TypeScript test configuration**

Create `bunfig.toml` with the install safety delay first; Task 3 adds coverage:

```toml
[install]
minimumReleaseAge = 259200
```

Create `test/tsconfig.json`:

```json
{
    "extends": "../tsconfig.json",
    "compilerOptions": {
        "noEmit": true,
        "rootDir": "..",
        "types": ["bun", "node"]
    },
    "include": ["../src", "."]
}
```

Copy the `gelf-client` correctness-only oxlint configuration, empty oxfmt
ignore list, and four-space LF `.editorconfig` into their listed files.

- [ ] **Step 5: Remove Yarn artifacts and generate the Bun lockfile**

Run:

```bash
git rm -r .yarn .yarnrc.yml yarn.lock index.spec.xml src/index.spec.ts
bun install
```

Update `.gitignore` to remove Yarn cache rules and keep `node_modules/`,
`dist/`, `*.tsbuildinfo`, `.DS_Store`, and `.local/` ignored.

- [ ] **Step 6: Run the migrated baseline**

Run:

```bash
bun test
bun run test:typecheck
bun run security
```

Expected: conversion tests pass, TypeScript resolves Bun and Node globals, and
the audit reports no known advisory. If the audit fails, record its advisory and
dependency path before changing any version.

- [ ] **Step 7: Commit the Bun baseline**

```bash
git add package.json bun.lock bunfig.toml .editorconfig .oxlintrc.json .oxfmtrc.json .gitignore test
git commit -m "build: migrate development tooling to Bun"
```

### Task 2: Type-Check the Source with TypeScript 7

**Files:**

- Modify: `tsconfig.json`
- Create: `tsconfig.esnext.json`
- Create: `tsconfig.cjs.json`
- Modify: `src/index.ts`
- Modify: `src/node/index.ts`

**Interfaces:**

- Consumes: Sax `QualifiedTag`, `QualifiedAttribute`, and readable stream APIs.
- Produces: strict source typechecks for `module: esnext` and
  `module: commonjs` without changing runtime exports.

- [ ] **Step 1: Split shared and module-specific compiler settings**

Set `tsconfig.json` to shared strict settings:

```json
{
    "compilerOptions": {
        "target": "esnext",
        "rootDir": "src",
        "declaration": true,
        "sourceMap": true,
        "types": ["node"],
        "strict": true,
        "forceConsistentCasingInFileNames": true,
        "skipLibCheck": true,
        "incremental": true,
        "noEmit": true
    },
    "exclude": ["node_modules", "test"],
    "include": ["src"]
}
```

Create `tsconfig.esnext.json` and `tsconfig.cjs.json`:

```json
{
    "extends": "./tsconfig.json",
    "compilerOptions": {
        "module": "esnext",
        "moduleResolution": "bundler",
        "outDir": "dist/types",
        "tsBuildInfoFile": "tsconfig.esnext.tsbuildinfo"
    }
}
```

```json
{
    "extends": "./tsconfig.json",
    "compilerOptions": {
        "module": "commonjs",
        "outDir": "dist/cjs-types",
        "tsBuildInfoFile": "tsconfig.cjs.tsbuildinfo"
    }
}
```

- [ ] **Step 2: Run both TypeScript targets and capture RED**

Run:

```bash
bunx tsc -p tsconfig.esnext.json
bunx tsc -p tsconfig.cjs.json
```

Expected: FAIL on any TypeScript 4-era Sax import or strictness assumptions.
Keep the exact diagnostics in the task notes.

- [ ] **Step 3: Make type-only source corrections**

Use Node-prefixed imports for built-ins in tests. In source, import Sax types
with `import type` where the emitted JavaScript does not need a value. Give the
query accumulator an explicit type:

```typescript
const result: Node[] = [];
```

Keep `import * as SAX from "sax"` where the module value calls
`SAX.createStream`. Do not rename exports or alter parser options.

- [ ] **Step 4: Verify source and behavior**

Run:

```bash
bunx tsc -p tsconfig.esnext.json
bunx tsc -p tsconfig.cjs.json
bun test
```

Expected: both compiler targets and the preservation tests pass.

- [ ] **Step 5: Commit TypeScript 7 compatibility**

```bash
git add tsconfig.json tsconfig.esnext.json tsconfig.cjs.json src
git commit -m "build: type-check source with TypeScript 7"
```

### Task 3: Reach and Enforce Full Production Coverage

**Files:**

- Modify: `bunfig.toml`
- Modify: `test/index.test.ts`
- Create: `test/node.test.ts`

**Interfaces:**

- Consumes: all public parser and tree APIs plus parser error propagation.
- Produces: a Bun coverage gate of `1.0` for lines, functions, and statements.

- [ ] **Step 1: Enable the full source coverage gate**

Append to `bunfig.toml`:

```toml
[test]
coverage = true
coverageSkipTestFiles = true
coveragePathIgnorePatterns = ["test/**"]
coverageThreshold = { lines = 1.0, functions = 1.0, statements = 1.0 }
```

- [ ] **Step 2: Run coverage and capture RED**

Run:

```bash
bun test --coverage --coverage-reporter=text
```

Expected: FAIL below 100%. Record each uncovered source line before adding a
test.

- [ ] **Step 3: Cover parser completion and failure paths**

Extend `test/index.test.ts` with malformed XML and chunked streams:

```typescript
test("rejects malformed XML", async () => {
    await expect(convertString("<root><item></root>")).rejects.toBeInstanceOf(Error);
});

test("collects text split across stream chunks", async () => {
    const node = await convertStream(Readable.from(["<root>hel", "lo</root>"]));
    expect(node.text).toBe("hello");
});
```

- [ ] **Step 4: Cover node, attribute, namespace, and query branches**

Create `test/node.test.ts` with XML that exercises `/`, absolute paths,
multi-segment relative paths, recursive name matches, missing paths, namespace
filters, attributes with and without namespace URIs, `root`, `text`,
`toString()`, and `hasAttribute()`.

Use assertions shaped like:

```typescript
expect(node.query("/")).toEqual([node]);
expect(node.query("/group/item")).toHaveLength(2);
expect(node.query("group/item")).toHaveLength(2);
expect(node.query("missing")).toEqual([]);
expect(node.query("item", "urn:test")).toHaveLength(1);
expect(node.query("item")[0]?.root).toBe(node);
expect(node.query("item")[0]?.getAttribute("missing")).toBeUndefined();
expect(node.query("item")[0]?.hasAttribute("id")).toBe(true);
```

- [ ] **Step 5: Run full coverage and type checks**

Run:

```bash
bun test --coverage --coverage-reporter=text
bun run test:typecheck
```

Expected: 100% lines, functions, and statements with zero test failures.

- [ ] **Step 6: Commit the coverage gate**

```bash
git add bunfig.toml test
git commit -m "test: enforce full source coverage"
```

### Task 4: Build and Verify the Dual Package

**Files:**

- Modify: `package.json`
- Create: `test/package-consumer.ts`

**Interfaces:**

- Consumes: named source exports and `sax` as an external package.
- Produces: package conditions `import`, `require`, and `types`, plus verified
  tarball artifacts.

- [ ] **Step 1: Create a packed consumer that demands the new contract**

Create `test/package-consumer.ts`. It must run `bun pm pack`, unpack the tarball
under a `mkdtemp()` directory, inspect `package.json`, and assert:

```typescript
const rootExport = packedPackageJson.exports?.["."];
if (
    rootExport?.types !== "./dist/types/index.d.ts" ||
    rootExport?.import !== "./dist/index.mjs" ||
    rootExport?.require !== "./dist/index.cjs"
) {
    throw new Error("The packed package does not expose the dual entrypoints");
}
if (Object.keys(packedPackageJson.dependencies ?? {}).join(",") !== "sax") {
    throw new Error("sax must be the only runtime dependency");
}
if (
    packedPackageJson.dependencies?.["@types/node"] !== undefined ||
    packedPackageJson.dependencies?.["@types/sax"] !== undefined
) {
    throw new Error("Type packages must stay out of runtime dependencies");
}
```

Write temporary ESM and CJS consumers that await `convertString("<root />")`
and verify `Node`, `Attribute`, `convertString`, and `convertStream` exports.
Write a TypeScript consumer and run TypeScript with `moduleResolution: bundler`.
Remove the temporary directory in `finally`.

- [ ] **Step 2: Run the consumer and capture RED**

Run:

```bash
bun test/package-consumer.ts
```

Expected: FAIL because the manifest and dual artifacts do not exist yet.

- [ ] **Step 3: Add package entrypoints and build scripts**

Set:

```json
"main": "./dist/index.cjs",
"module": "./dist/index.mjs",
"types": "./dist/types/index.d.ts",
"typings": "./dist/types/index.d.ts",
"exports": {
    ".": {
        "types": "./dist/types/index.d.ts",
        "import": "./dist/index.mjs",
        "require": "./dist/index.cjs",
        "default": "./dist/index.mjs"
    }
}
```

Use:

```json
"clean": "rimraf dist tsconfig.tsbuildinfo tsconfig.esnext.tsbuildinfo tsconfig.cjs.tsbuildinfo",
"typecheck:source": "tsc -p tsconfig.esnext.json && tsc -p tsconfig.cjs.json",
"build:types": "tsc -p tsconfig.esnext.json --noEmit false --emitDeclarationOnly",
"build:esm": "bun build src/index.ts --target=node --format=esm --packages=external --sourcemap=linked --minify-syntax --outdir=dist --entry-naming=index.mjs",
"build:cjs": "bun build src/index.ts --target=node --format=cjs --packages=external --sourcemap=linked --minify-syntax --outdir=dist --entry-naming=index.cjs",
"build": "bun run clean && bun run typecheck:source && bun run build:types && bun run build:esm && bun run build:cjs",
"test:package": "bun test/package-consumer.ts"
```

Set `check` to run `fmt:check`, `lint`, both typechecks, tests, build, and the
packed consumer in that order.

- [ ] **Step 4: Verify the dual package**

Run:

```bash
bun run build
bun run test:package
bun pm pack --dry-run
```

Expected: CJS, ESM, maps, declarations, runtime consumers, TypeScript consumer,
and tarball file list pass.

- [ ] **Step 5: Commit the package build**

```bash
git add package.json test/package-consumer.ts
git commit -m "build: publish dual Bun bundles"
```

### Task 5: Correct and Expand the README

**Files:**

- Modify: `README.md`

**Interfaces:**

- Consumes: verified CJS, ESM, TypeScript, conversion, node, and query APIs.
- Produces: examples that match the consumer tests and source behavior.

- [ ] **Step 1: Rewrite installation and module examples**

Add npm, Bun, and Yarn commands. Use these API forms:

```typescript
import { convertString } from "xml2o";
const root = await convertString("<root><item id=\"1\">value</item></root>");
```

```javascript
const { convertString } = require("xml2o");
const root = await convertString("<root><item id=\"1\">value</item></root>");
```

Remove the nonexistent `createString` name and every synchronous conversion
example.

- [ ] **Step 2: Check API reference and prose against source**

Document `convertString`, `convertStream`, `Node`, `Attribute`, promise returns,
query path forms, namespace URI arguments, parser rejection, and node text
aggregation. Correct grammar without adding behavior claims that lack tests.

- [ ] **Step 3: Add development commands**

Document:

```bash
bun install
bun run security
bun test
bun run build
bun run check
```

- [ ] **Step 4: Verify documentation examples through repository checks**

Run:

```bash
bun run test:package
bun run fmt:check
git diff --check
```

Expected: module forms match the packed package and Markdown has no whitespace
errors.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md
git commit -m "docs: document installation and module usage"
```

### Task 6: Add CI, Strict Audit, and Trusted Publishing

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `.github/workflows/publish.yml`

**Interfaces:**

- Consumes: `bun ci`, `bun run security`, and `bun run check`.
- Produces: branch CI and tag publishing through npm OIDC.

- [ ] **Step 1: Add branch CI**

Create a workflow for every push and pull request with `contents: read`, a
ref-scoped concurrency group, pinned `actions/checkout` and `setup-bun`, then:

```yaml
- run: bun ci
- name: Audit dependencies
  run: bun run security
- run: bun run check
```

Use the action commits already verified in `gelf-client`:

```yaml
actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2
```

- [ ] **Step 2: Replace token publishing with npm OIDC**

Keep the `v*` tag trigger and add `workflow_dispatch.inputs.tag`. Grant
`contents: read` and `id-token: write`. Check out the exact tag, run Bun install,
audit, and checks, then configure:

```yaml
actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
```

with Node 24 and the npm registry. Publish with:

```yaml
- run: npm publish --provenance
```

Remove `fregante/setup-git-user`, `NODE_AUTH_TOKEN`, and `NPM_TOKEN`.

- [ ] **Step 3: Validate workflow content locally**

Run:

```bash
rg -n 'NPM_TOKEN|NODE_AUTH_TOKEN|setup-git-user|uses: .*@(v|main|master)' .github
rg -n 'id-token: write|npm publish --provenance|bun run security|bun run check' .github
git diff --check
```

Expected: the first command returns no match; the second finds the required
OIDC, audit, verification, and publish steps.

- [ ] **Step 4: Commit workflows**

```bash
git add .github/workflows
git commit -m "ci: verify and publish with Bun"
```

### Task 7: Run the Final Package and Security Gates

**Files:**

- Modify only files required by a concrete failing gate.

**Interfaces:**

- Consumes: all prior tasks.
- Produces: evidence for dependency freshness, audit state, coverage, build,
  consumers, documentation, and repository cleanliness.

- [ ] **Step 1: Check direct dependency freshness**

Run:

```bash
bun outdated
```

Expected: no direct dependency has a newer compatible or latest release than
the versions recorded in this plan. Explain any package held back by
`minimumReleaseAge`.

- [ ] **Step 2: Run the strict audit and full check**

Run:

```bash
bun run security
bun run check
bun pm pack --dry-run
```

Expected: audit has no advisory; formatting, linting, typechecks, 100% coverage,
dual build, consumer checks, and tarball inspection pass.

- [ ] **Step 3: Inspect the final dependency and file diff**

Run:

```bash
git diff origin/main...HEAD -- package.json bun.lock
git diff origin/main...HEAD --stat
git diff --check
git status --short --branch
```

Expected: only `sax` appears in `dependencies`; both type packages appear under
`devDependencies`; no Yarn artifact remains; the worktree is clean after the
final commit.

- [ ] **Step 4: Route any failure back to its owning task**

Do not create a generic cleanup commit. A dependency, test, build, README, or
workflow failure reopens Task 1, 3, 4, 5, or 6 respectively and uses that
task's focused files, verification command, and commit message.
