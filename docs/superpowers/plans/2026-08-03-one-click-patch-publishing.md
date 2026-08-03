# xml2o One-Click Patch Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the input-free GitHub Actions `Publish` button prepare, tag, and
publish the next patch version of `xml2o`, while safely retrying a previously
prepared but unpublished patch.

**Architecture:** A dependency-free TypeScript helper owns stable SemVer patch
selection and the prepare-versus-retry state machine. One GitHub Actions
workflow uses that helper during a write-scoped manual run, atomically pushes a
release commit and tag, then dispatches the same workflow on that tag. A
read-only job verifies and packs the exact release; a separate artifact-only
job receives OIDC and publishes it.

**Tech Stack:** Bun 1.3.14, TypeScript 7.0.2, `bun:test`, Bash, Git, GitHub
Actions, Node.js 24, npm Trusted Publishing, GitHub REST API.

## Global Constraints

- Keep the workflow name `Publish` and expose `workflow_dispatch` with no
  inputs.
- Support only stable three-part numeric versions (`X.Y.Z`) and patch bumps.
- When `package.json` equals npm `latest`, prepare exactly `patch + 1`.
- When `package.json` is already that pending patch, retry its existing tag
  without another bump.
- Fail without mutation for every other package, registry, or tag relationship.
- Do not bootstrap an unpublished npm package or guess when npm lookup fails.
- Use `npm version "$RELEASE_VERSION" --no-git-tag-version --ignore-scripts` so
  the existing `postversion` push is never run by the workflow.
- Run `bun ci`, unfiltered `bun run security`, and `bun run check` before a new
  release commit and again on the immutable tag before publishing.
- Atomically push the release commit to `main` with its annotated `vX.Y.Z` tag.
- Dispatch `.github/workflows/publish.yml` internally with the release tag as
  `ref`; do not rely on tag pushes to trigger publication.
- Prevent overlapping manual and dispatched runs with one concurrency group and
  `cancel-in-progress: false`; retry the same tag if GitHub replaces a redundant
  pending run.
- Give `contents: write` and `actions: write` only to release preparation.
  Keep verification and package scripts outside the job with
  `id-token: write`.
- Revalidate npm immediately before packing. Publish only the absent next patch;
  treat an already-published latest version as an idempotent retry.
- Publish the checksummed package artifact with
  `npm publish --ignore-scripts --provenance` and never use `NPM_TOKEN`.
- Keep GitHub Action references pinned to full commit hashes.
- Add no production, development, or release-management package dependency.
- Do not change `xml2o`'s package version, create a release tag, or invoke the
  `Publish` workflow while implementing this plan.

---

### Task 1: Implement the Patch Release State Machine

**Files:**

- Create: `scripts/release-version.ts`
- Create: `test/release-version.test.ts`
- Modify: `bunfig.toml`

**Interfaces:**

- Produces:
  `incrementPatch(version: string): string` for strict stable-version patch
  increments.
- Produces:
  `resolveRelease(input: ReleaseInput): ReleaseDecision`, where
  `ReleaseInput` contains `packageVersion`, `registryVersion`, and
  `taggedVersion`, and `ReleaseDecision` contains `mode`, `version`, and `tag`.
- Produces CLI commands
  `bun scripts/release-version.ts next VERSION` and
  `bun scripts/release-version.ts resolve PACKAGE_VERSION REGISTRY_VERSION TAG_VERSION_OR_DASH`.
- Consumed by Task 2's prepare job; CLI `resolve` writes GitHub output-compatible
  `mode=`, `version=`, and `tag=` lines to stdout.

- [ ] **Step 1: Write failing unit and CLI tests for the release policy**

Create `test/release-version.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { incrementPatch, resolveRelease } from "../scripts/release-version";

const script = fileURLToPath(new URL("../scripts/release-version.ts", import.meta.url));

describe("incrementPatch", () => {
    test("increments only the patch component", () => {
        expect(incrementPatch("0.4.13")).toBe("0.4.14");
        expect(incrementPatch("12.34.56")).toBe("12.34.57");
    });

    test("does not lose precision for a large patch component", () => {
        expect(incrementPatch("1.2.9007199254740992")).toBe("1.2.9007199254740993");
    });

    test("rejects non-stable versions", () => {
        for (const version of ["1.2", "1.2.3-beta.1", "01.2.3", "v1.2.3"]) {
            expect(() => incrementPatch(version)).toThrow(`Invalid npm version: ${version}`);
        }
    });
});

describe("resolveRelease", () => {
    test("prepares the next patch when repository and npm match", () => {
        expect(
            resolveRelease({
                packageVersion: "0.4.13",
                registryVersion: "0.4.13",
                taggedVersion: null,
            }),
        ).toEqual({ mode: "prepare", version: "0.4.14", tag: "v0.4.14" });
    });

    test("retries an existing pending patch", () => {
        expect(
            resolveRelease({
                packageVersion: "0.4.14",
                registryVersion: "0.4.13",
                taggedVersion: "0.4.14",
            }),
        ).toEqual({ mode: "retry", version: "0.4.14", tag: "v0.4.14" });
    });

    test("rejects a conflicting tag for a new patch", () => {
        expect(() =>
            resolveRelease({
                packageVersion: "0.4.13",
                registryVersion: "0.4.13",
                taggedVersion: "0.4.14",
            }),
        ).toThrow("Cannot prepare v0.4.14: tag already exists with package version 0.4.14");
    });

    test("rejects a retry with no tag", () => {
        expect(() =>
            resolveRelease({
                packageVersion: "0.4.14",
                registryVersion: "0.4.13",
                taggedVersion: null,
            }),
        ).toThrow("Cannot retry v0.4.14: tag is missing");
    });

    test("rejects a retry whose tag contains another version", () => {
        expect(() =>
            resolveRelease({
                packageVersion: "0.4.14",
                registryVersion: "0.4.13",
                taggedVersion: "0.4.99",
            }),
        ).toThrow("Cannot retry v0.4.14: tagged package version is 0.4.99");
    });

    test("rejects repository and registry divergence", () => {
        expect(() =>
            resolveRelease({
                packageVersion: "0.5.0",
                registryVersion: "0.4.13",
                taggedVersion: null,
            }),
        ).toThrow("Version divergence: package.json=0.5.0, npm=0.4.13, pending patch=0.4.14");
    });

    test("rejects a malformed package version", () => {
        expect(() =>
            resolveRelease({
                packageVersion: "0.4.14-beta.1",
                registryVersion: "0.4.13",
                taggedVersion: null,
            }),
        ).toThrow("Invalid package.json version: 0.4.14-beta.1");
    });
});

describe("release-version CLI", () => {
    test("prints a GitHub output-compatible prepare decision", () => {
        const result = Bun.spawnSync(["bun", script, "resolve", "0.4.13", "0.4.13", "-"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout.toString()).toBe("mode=prepare\nversion=0.4.14\ntag=v0.4.14\n");
    });

    test("returns a non-zero status for an invalid decision", () => {
        const result = Bun.spawnSync(["bun", script, "resolve", "0.5.0", "0.4.13", "-"]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr.toString()).toContain("Version divergence");
    });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun test test/release-version.test.ts
```

Expected: FAIL because `scripts/release-version.ts` does not exist.

- [ ] **Step 3: Implement the dependency-free resolver and CLI**

Create `scripts/release-version.ts`:

```typescript
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface ReleaseInput {
    packageVersion: string;
    registryVersion: string;
    taggedVersion: string | null;
}

export interface ReleaseDecision {
    mode: "prepare" | "retry";
    version: string;
    tag: string;
}

function parseStableVersion(
    version: string,
    source: "npm" | "package.json",
): readonly [string, string, string] {
    const match = STABLE_VERSION.exec(version);
    if (!match) {
        throw new Error(`Invalid ${source} version: ${version}`);
    }

    return [match[1], match[2], match[3]];
}

export function incrementPatch(version: string): string {
    const [major, minor, patch] = parseStableVersion(version, "npm");
    return `${major}.${minor}.${BigInt(patch) + 1n}`;
}

export function resolveRelease(input: ReleaseInput): ReleaseDecision {
    parseStableVersion(input.packageVersion, "package.json");
    const releaseVersion = incrementPatch(input.registryVersion);
    const tag = `v${releaseVersion}`;

    if (input.packageVersion === input.registryVersion) {
        if (input.taggedVersion !== null) {
            throw new Error(
                `Cannot prepare ${tag}: tag already exists with package version ${input.taggedVersion}`,
            );
        }

        return { mode: "prepare", version: releaseVersion, tag };
    }

    if (input.packageVersion === releaseVersion) {
        if (input.taggedVersion === null) {
            throw new Error(`Cannot retry ${tag}: tag is missing`);
        }
        if (input.taggedVersion !== releaseVersion) {
            throw new Error(
                `Cannot retry ${tag}: tagged package version is ${input.taggedVersion}`,
            );
        }

        return { mode: "retry", version: releaseVersion, tag };
    }

    throw new Error(
        `Version divergence: package.json=${input.packageVersion}, npm=${input.registryVersion}, pending patch=${releaseVersion}`,
    );
}

function requireArguments(command: string, values: string[], count: number): void {
    if (values.length !== count) {
        throw new Error(
            `Usage error: ${command} expects ${count} argument${count === 1 ? "" : "s"}`,
        );
    }
}

function runCli(arguments_: string[]): void {
    const [command, ...values] = arguments_;

    if (command === "next") {
        requireArguments(command, values, 1);
        process.stdout.write(`${incrementPatch(values[0])}\n`);
        return;
    }

    if (command === "resolve") {
        requireArguments(command, values, 3);
        const decision = resolveRelease({
            packageVersion: values[0],
            registryVersion: values[1],
            taggedVersion: values[2] === "-" ? null : values[2],
        });
        process.stdout.write(
            `mode=${decision.mode}\nversion=${decision.version}\ntag=${decision.tag}\n`,
        );
        return;
    }

    throw new Error("Usage: release-version.ts next|resolve");
}

if (import.meta.main) {
    try {
        runCli(process.argv.slice(2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
```

- [ ] **Step 4: Keep release infrastructure outside package coverage scope**

Change the existing `bunfig.toml` coverage ignore line to:

```toml
coveragePathIgnorePatterns = ["test/**", "scripts/**"]
```

This keeps the enforced 100% threshold scoped to published production code
under `src/**`; the resolver still has its own focused tests.

- [ ] **Step 5: Run resolver tests and typechecks and verify GREEN**

Run:

```bash
bun test test/release-version.test.ts
bun run test:typecheck
bun run fmt:check
bun run lint
```

Expected: all resolver tests pass, the helper and tests type-check, and the
formatter and linter report no errors.

- [ ] **Step 6: Commit the tested version policy**

```bash
git add scripts/release-version.ts test/release-version.test.ts bunfig.toml
git commit -m "feat: add patch release version resolver"
```

### Task 2: Implement and Harden the Input-Free Publish Workflow

**Files:**

- Modify: `.github/workflows/publish.yml`
- Create: `test/publish-workflow.test.ts`
- Modify: `test/release-version.test.ts`
- Modify: `scripts/release-version.ts`
- Modify: `docs/superpowers/specs/2026-08-03-one-click-patch-publishing-design.md`

**Workflow contract:**

- A `validate-dispatch` job rejects every ref except `main` and stable
  `vX.Y.Z` tags.
- A write-scoped `prepare-release` job resolves a new patch or retry, requires
  annotated release tags, validates a new candidate, and atomically pushes
  `main` plus its tag before dispatching `publish.yml` on that tag.
- A read-only `verify-release` job checks the tag, event SHA, `main`
  reachability, package version, locked install, unfiltered audit, full package
  checks, and current npm registry state. It then runs
  `npm pack --ignore-scripts`, creates a SHA-256 file, and uploads both through
  a full-SHA-pinned artifact action.
- Only the artifact-only `publish` job has `id-token: write`. It has no
  checkout or Bun step, verifies the downloaded SHA-256 file, and runs
  `npm publish "$archive" --ignore-scripts --provenance`.
- An already-published tagged version that is npm `latest` is an idempotent
  tag-run success. An occupied non-latest candidate or any other registry
  divergence fails.
- Artifact upload uses `overwrite: true` so GitHub `Re-run all jobs` can
  recover from a later transient failure.
- No `NPM_TOKEN`, workflow input, tag-push trigger, or added package dependency
  is allowed.

**Regression tests:**

The parsed-YAML contract tests assert job conditions, dependencies, exact
job-scoped permissions, full-SHA action pins, annotated-tag checks, atomic push,
registry revalidation, artifact handoff, and absence of repository execution in
the OIDC job. A shell-level regression executes the absent-candidate jq filter
under `set -euo pipefail` and requires successful output `false`; do not use
`jq -e` for that boolean because jq assigns false exit status 1.

Run:

```bash
bun test test/release-version.test.ts test/publish-workflow.test.ts
bun run security
bun run check
git diff --check
```

Expected: resolver and workflow regressions pass, Bun reports no
vulnerabilities, formatting/lint/typechecks/builds/package consumers pass with
100% production source coverage, and Git reports no whitespace errors.

Do not run the workflow while implementing. Before the first operator-triggered
release, confirm all of the following:

- GitHub Actions has read/write workflow permission and can update `main`;
- a tag ruleset allows creation but prevents update or deletion of existing
  `v*` tags;
- npm Trusted Publisher uses owner `izatop`, repository `xml2o`, and
  workflow filename `publish.yml` (filename only);
- the first manual `Publish` run on `main` is the operation that creates and
  publishes `xml2o@0.4.14`.
