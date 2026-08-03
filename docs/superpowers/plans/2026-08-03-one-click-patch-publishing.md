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

### Task 2: Replace Tag Input Publishing with the Two-Phase Workflow

**Files:**

- Create: `test/publish-workflow.test.ts`
- Modify: `.github/workflows/publish.yml`

**Interfaces:**

- Consumes Task 1 CLI commands `next` and `resolve`.
- Produces input-free `workflow_dispatch` release preparation.
- Produces an internal workflow dispatch on the immutable release tag, with no
  inputs.
- Produces an immutable-tag publish path with npm OIDC provenance.

- [ ] **Step 1: Write a failing workflow contract test**

Create `test/publish-workflow.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

const workflow = await Bun.file(
    new URL("../.github/workflows/publish.yml", import.meta.url),
).text();

describe("Publish workflow", () => {
    test("uses only an input-free workflow dispatch trigger", () => {
        expect(workflow).toContain("workflow_dispatch:");
        expect(workflow).not.toContain("repository_dispatch:");
        expect(workflow).not.toContain("inputs:");
        expect(workflow).not.toMatch(/^\s+push:\s*$/m);
    });

    test("serializes release preparation and publication", () => {
        expect(workflow).toContain("group: publish-${{ github.repository }}");
        expect(workflow).toContain("cancel-in-progress: false");
    });

    test("separates write and OIDC permissions", () => {
        expect(workflow).toContain("permissions: {}");
        expect(workflow.match(/contents: write/g) ?? []).toHaveLength(1);
        expect(workflow.match(/actions: write/g) ?? []).toHaveLength(1);
        expect(workflow.match(/id-token: write/g) ?? []).toHaveLength(1);
    });

    test("uses atomic refs and provenance without a registry token", () => {
        expect(workflow).toContain(
            'git push --atomic origin HEAD:refs/heads/main "refs/tags/$RELEASE_TAG"',
        );
        expect(workflow).toContain(
            "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/actions/workflows/publish.yml/dispatches",
        );
        expect(workflow).toContain("RELEASE_SHA: ${{ github.sha }}");
        expect(workflow).toContain("npm publish --provenance");
        expect(workflow).not.toContain("NPM_TOKEN");
    });
});
```

- [ ] **Step 2: Run the workflow contract test and verify RED**

Run:

```bash
bun test test/publish-workflow.test.ts
```

Expected: FAIL because the current workflow has a tag-push trigger and a
required `tag` input, and lacks concurrency, write-scoped preparation, and an
atomic release push.

- [ ] **Step 3: Implement the two-phase release and publish workflow**

Replace `.github/workflows/publish.yml` with:

```yaml
name: Publish

on:
    workflow_dispatch:

permissions: {}

concurrency:
    group: publish-${{ github.repository }}
    cancel-in-progress: false

jobs:
    prepare-release:
        if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'
        runs-on: ubuntu-latest
        permissions:
            actions: write
            contents: write
        steps:
            - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
              with:
                  ref: main
                  fetch-depth: 0
            - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2
            - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
              with:
                  node-version: 24
            - id: release
              name: Resolve patch release
              shell: bash
              run: |
                  set -euo pipefail
                  package_name="$(jq -er '.name' package.json)"
                  package_version="$(jq -er '.version' package.json)"
                  published_version="$(npm view "${package_name}@latest" version)"
                  release_version="$(bun scripts/release-version.ts next "$published_version")"
                  release_tag="v${release_version}"
                  tagged_version="-"

                  if git show-ref --verify --quiet "refs/tags/$release_tag"; then
                    tagged_version="$(git show "${release_tag}:package.json" | jq -er '.version')"
                  fi

                  bun scripts/release-version.ts resolve \
                    "$package_version" \
                    "$published_version" \
                    "$tagged_version" >> "$GITHUB_OUTPUT"
            - name: Validate and create release
              if: steps.release.outputs.mode == 'prepare'
              shell: bash
              env:
                  RELEASE_TAG: ${{ steps.release.outputs.tag }}
                  RELEASE_VERSION: ${{ steps.release.outputs.version }}
              run: |
                  set -euo pipefail
                  npm version "$RELEASE_VERSION" --no-git-tag-version --ignore-scripts
                  bun ci
                  bun run security
                  bun run check

                  git config user.name "github-actions[bot]"
                  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
                  git add package.json
                  git commit -m "release: $RELEASE_TAG"
                  git tag --annotate "$RELEASE_TAG" --message "Release $RELEASE_TAG"
                  git push --atomic origin HEAD:refs/heads/main "refs/tags/$RELEASE_TAG"
            - name: Verify tagged commit
              shell: bash
              env:
                  RELEASE_TAG: ${{ steps.release.outputs.tag }}
              run: |
                  set -euo pipefail
                  release_sha="$(git rev-list -n 1 "$RELEASE_TAG")"
                  git fetch --no-tags origin "+refs/heads/main:refs/remotes/origin/main"
                  git merge-base --is-ancestor "$release_sha" origin/main
            - name: Start trusted publish run
              env:
                  GITHUB_TOKEN: ${{ github.token }}
                  RELEASE_TAG: ${{ steps.release.outputs.tag }}
              shell: bash
              run: |
                  set -euo pipefail
                  payload="$(jq -cn \
                    --arg ref "$RELEASE_TAG" \
                    '{ref: $ref}')"
                  curl --fail-with-body \
                    --request POST \
                    --header "Accept: application/vnd.github+json" \
                    --header "Authorization: Bearer $GITHUB_TOKEN" \
                    --header "X-GitHub-Api-Version: 2026-03-10" \
                    "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/actions/workflows/publish.yml/dispatches" \
                    --data "$payload"

    publish:
        if: github.event_name == 'workflow_dispatch' && startsWith(github.ref, 'refs/tags/v')
        runs-on: ubuntu-latest
        permissions:
            contents: read
            id-token: write
        steps:
            - id: release-ref
              name: Validate release ref
              env:
                  RELEASE_SHA: ${{ github.sha }}
                  RELEASE_TAG: ${{ github.ref_name }}
              shell: bash
              run: |
                  set -euo pipefail
                  if ! [[ "$RELEASE_TAG" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
                    echo "Invalid stable release tag: $RELEASE_TAG" >&2
                    exit 1
                  fi
                  if ! git check-ref-format "refs/tags/$RELEASE_TAG"; then
                    echo "Invalid Git tag ref: $RELEASE_TAG" >&2
                    exit 1
                  fi
                  if ! [[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
                    echo "Invalid release commit SHA" >&2
                    exit 1
                  fi

                  printf 'tag=%s\n' "$RELEASE_TAG" >> "$GITHUB_OUTPUT"
                  printf 'sha=%s\n' "$RELEASE_SHA" >> "$GITHUB_OUTPUT"
            - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
              with:
                  ref: refs/tags/${{ steps.release-ref.outputs.tag }}
                  fetch-depth: 0
            - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2
            - name: Verify immutable release source
              env:
                  RELEASE_SHA: ${{ steps.release-ref.outputs.sha }}
                  RELEASE_TAG: ${{ steps.release-ref.outputs.tag }}
              shell: bash
              run: |
                  set -euo pipefail
                  actual_sha="$(git rev-parse HEAD)"
                  tagged_sha="$(git rev-list -n 1 "$RELEASE_TAG")"
                  package_version="$(jq -er '.version' package.json)"

                  if [ "$actual_sha" != "$RELEASE_SHA" ] || [ "$tagged_sha" != "$RELEASE_SHA" ]; then
                    echo "Release tag and event SHA do not match" >&2
                    exit 1
                  fi
                  if [ "v$package_version" != "$RELEASE_TAG" ]; then
                    echo "Package version and release tag do not match" >&2
                    exit 1
                  fi

                  git fetch --no-tags origin "+refs/heads/main:refs/remotes/origin/main"
                  git merge-base --is-ancestor "$RELEASE_SHA" origin/main
            - run: bun ci
            - name: Audit dependencies
              run: bun run security
            - run: bun run check
            - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
              with:
                  node-version: 24
                  registry-url: "https://registry.npmjs.org"
            - run: npm publish --provenance
```

- [ ] **Step 4: Run the focused workflow test and verify GREEN**

Run:

```bash
bun test test/publish-workflow.test.ts
bun run test:typecheck
bun run fmt:check
bun run lint
```

Expected: the workflow contract passes, all new TypeScript test files
type-check, and YAML/TypeScript formatting and linting pass.

- [ ] **Step 5: Run the complete package and security gates**

Run:

```bash
bun run security
bun run check
git diff --check
```

Expected: Bun reports no vulnerabilities; formatting, linting, both source
typechecks, test typechecking, unit tests with 100% production coverage, dual
build, and packed-package consumption all pass; Git reports no whitespace
errors.

- [ ] **Step 6: Inspect the workflow's dangerous boundaries**

Run:

```bash
rg -n "workflow_dispatch|actions: write|contents: write|id-token: write|git push --atomic|actions/workflows/publish.yml/dispatches|npm publish --provenance" .github/workflows/publish.yml
rg -n "repository_dispatch|inputs:|NPM_TOKEN|^[[:space:]]+push:" .github/workflows/publish.yml
```

Expected: the first command shows the manual/tag dispatch trigger, exactly one
Actions write permission, exactly one contents write permission, exactly one
OIDC permission, the atomic push, the tag-ref dispatch endpoint, and provenance
publishing. The second command exits with status 1 and no matches.

- [ ] **Step 7: Commit the workflow implementation**

```bash
git add .github/workflows/publish.yml test/publish-workflow.test.ts
git commit -m "ci: automate patch releases from publish button"
```

After this commit, stop without running the workflow. The implementation may be
pushed after review, but first confirm GitHub Actions has read/write workflow
permission and can update `main`, configure immutable existing `v*` tags, and
confirm npm Trusted Publisher uses owner `izatop`, repository `xml2o`, and
workflow filename `publish.yml`. The owner's first manual `Publish` run is the
operation that creates and publishes `xml2o@0.4.14`.

## Review Hardening Amendment

The workflow implementation supersedes the earlier Task 2 code sample in these
security-sensitive details:

- unsupported manual refs fail explicitly;
- release refs must be annotated tags, and repository rules must prevent
  updates or deletion of existing `v*` tags;
- a no-OIDC verification job runs Bun install, audit, checks, final npm state
  validation, `npm pack --ignore-scripts`, and SHA-256 generation;
- only a separate artifact-only job has `id-token: write`; it verifies the
  digest and publishes with package scripts disabled;
- npm Trusted Publisher's workflow field is `publish.yml`, not a repository
  path.
