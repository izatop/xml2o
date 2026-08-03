# xml2o One-Click Patch Publishing Design

## Goal

Make the existing GitHub Actions `Publish` button create and publish the next
patch release of `xml2o` without asking for a tag or version. A successful run
must update `package.json`, create a release commit and annotated tag, push both
to `main`, and publish that exact tag to npm through Trusted Publishing.

The first normal run from the current `xml2o@0.4.13` state will prepare and
publish `0.4.14` with tag `v0.4.14`.

## User Interface

The workflow keeps the name `Publish` and exposes `workflow_dispatch` with no
inputs. The operator opens GitHub Actions, chooses `Publish`, and selects
`Run workflow`. Patch releases are the only release type supported by this
button.

Manually supplied versions, major or minor bumps, prereleases, npm dist-tags,
and GitHub Release objects are outside this workflow. A manually pushed tag
will not be an alternative publish trigger.

## Architecture

One workflow file has two `workflow_dispatch` phases distinguished by the ref:

1. A manual run on `main` prepares the release and dispatches the same workflow
   on the new release tag after the release commit and tag are on GitHub.
2. The internally dispatched tag run checks out that exact tag, verifies and
   packs it without OIDC access, then hands the checksummed package artifact to
   a minimal npm OIDC publish job.

The phases cannot rely on a tag push alone. GitHub does not start another
workflow from a tag pushed with the repository's `GITHUB_TOKEN`. The prepare
job instead calls GitHub's workflow-dispatch API with `ref` set to the release
tag. `workflow_dispatch` is allowed to create another run when authenticated by
`GITHUB_TOKEN`, and the tag ref makes `GITHUB_REF` and `GITHUB_SHA` identify the
exact release source used by npm provenance.

Workflow-level concurrency uses one group per repository with
`cancel-in-progress: false`. Only one run can actively select, prepare, or
publish a version. GitHub may replace a redundant pending run with a newer run
in the same concurrency group; the retry state ensures that the surviving run
resumes the existing tag instead of skipping a patch.

## Version Selection

The prepare phase reads:

- the package name and version from `package.json`;
- the currently published version from the npm `latest` dist-tag;
- the relevant tag and commit state from Git.

Only stable three-part numeric versions (`X.Y.Z`) are accepted. Let `R` be the
registry version and `N` be `R` with its patch component incremented by one.
The workflow follows this state table:

| Repository state                                                                      | Result                                        |
| ------------------------------------------------------------------------------------- | --------------------------------------------- |
| `package.json` is `R`                                                                 | Prepare new release `N`                       |
| `package.json` is `N`, and existing `vN` identifies the commit containing version `N` | Retry publication of `N` without another bump |
| Any other version or tag relationship                                                 | Fail before mutation                          |

Retry behavior is required because the commit and tag are pushed before npm is
called. If dispatch, verification, OIDC, or npm temporarily fails, another
button click republishes the same tag instead of skipping to the next patch.
If npm cannot return the current published version, the workflow stops rather
than guessing. It does not bootstrap an unpublished package.

A small dependency-free script implements strict version parsing, this decision
table, and the final publication policy. The tag run re-reads npm immediately
before packing. It publishes only when the tagged version is exactly one patch
above `latest` and is absent from the published version list. If that version
is already `latest`, the retry succeeds without publishing again. Every other
registry relationship fails. This isolates the version policy from GitHub
Actions orchestration and makes the important cases unit-testable without
adding a package dependency.

## Prepare Phase

The prepare job runs only for `workflow_dispatch` on `main` and receives
`contents: write` plus `actions: write`. It will:

1. Check out the current default `main` with complete tag history.
2. Install the pinned Bun toolchain and Node 24.
3. Query npm and resolve either a new patch or a retry using the rules above.
4. For a new patch, run
   `npm version "$N" --no-git-tag-version --ignore-scripts`. The explicit flags
   prevent the existing `postversion` script from pushing during preparation.
5. For a new patch, run `bun ci`, the unfiltered `bun run security`, and
   `bun run check` against the exact candidate tree.
6. Create a release commit named `release: v$N` and an annotated `v$N` tag.
7. Atomically push the release commit to `main` together with the tag.
8. Call the workflow-dispatch API for `.github/workflows/publish.yml` with the
   immutable release tag as `ref` and no inputs.

In retry mode the job does not rewrite `package.json`, create another commit,
move a tag, or validate a later mutable `main` tree as if it were the release.
It verifies the existing tag and dispatches the workflow on that tag ref; the
publish phase then runs the full checks against the same immutable tag.

The atomic push prevents a remote state containing only the commit or only the
tag. If validation, version resolution, or the push fails, npm is not called.
If the dispatch call fails after a successful push, the next button click enters
retry mode and resumes from the existing tag.

## Verify and Publish Phase

The tag dispatch first runs a verification job with `contents: read` and no
OIDC permission. It will:

1. Validate `github.ref_name` as a stable release tag and `github.sha` as a full
   commit SHA.
2. Check out `refs/tags/$TAG` with sufficient history and require an annotated
   Git tag object.
3. Verify that the tag resolves to `github.sha`, that the commit is reachable
   from `main`, and that `package.json` exactly matches the tag version.
4. Run `bun ci`, `bun run security`, and `bun run check` again on the immutable
   release source.
5. Re-read npm's latest and complete version list and apply the strict
   publication policy above.
6. If publication is required, create a package using
   `npm pack --ignore-scripts`, record its SHA-256 digest, and upload both as a
   short-lived workflow artifact.

A separate minimal job receives `actions: read` and `id-token: write`. It does
not check out repository code, install dependencies, run Bun, or execute package
scripts. It downloads the verified artifact, checks the SHA-256 digest, and
runs `npm publish "$archive" --ignore-scripts --provenance` through npm Trusted
Publishing. No `NPM_TOKEN` secret is introduced.

## Failure and Recovery

- Validation or tests fail before the push: no release commit, tag, or npm
  version is created.
- The atomic push fails: neither remote ref should change, and the run fails.
- Dispatch fails after the push: the release commit and tag remain; clicking
  `Publish` again retries that version.
- Verification, artifact transfer, or npm fails after the push: the release
  commit and tag remain; clicking `Publish` again retries that version.
- The tagged version was published but the tag run lost its final response:
  rerunning that tag verifies that it is already npm `latest` and exits
  successfully without trying to publish the immutable version again.
- Repository and npm versions diverge beyond the single pending patch: the run
  reports the observed versions and exits without changing refs.
- Concurrent clicks: the repository concurrency group prevents overlapping
  mutation; if GitHub replaces a redundant pending run, the surviving run uses
  the same pending patch state.

The GitHub repository must allow Actions to use a read/write `GITHUB_TOKEN`,
including `actions: write`, and must permit that token to update `main` and
create `v*` tags. A tag ruleset must prevent updates and deletion of existing
`v*` tags while still allowing the workflow to create new tags.

npm Trusted Publisher configuration must use owner `izatop`, repository
`xml2o`, and workflow filename `publish.yml` (the npm field accepts the
filename only, not `.github/workflows/publish.yml`). It must allow npm
publication. Missing repository or npm permissions produce a visible failed run
without choosing another version.

## Tests and Verification

Unit tests for the version resolver will cover at least:

- normal patch selection (`0.4.13` published and local becomes `0.4.14`);
- retry selection (`0.4.13` published, local and tag are `0.4.14`);
- version divergence;
- missing or mismatched retry tag;
- malformed and prerelease versions;
- patch increment without numeric coercion errors;
- next-patch publication, already-published idempotency, and registry
  divergence.

Repository verification will also check workflow formatting, shell syntax where
applicable, and the existing full package checks. The implemented workflow will
be inspected to confirm that the manual trigger has no inputs, permissions are
job-scoped, pushes are atomic, package verification runs without OIDC, and only
the artifact-only publish job receives OIDC access.

End-to-end publication is intentionally initiated by the operator after the
workflow change reaches `main`. A successful first run must leave all of these
facts true:

- `main` contains `package.json` version `0.4.14`;
- annotated tag `v0.4.14` points to its release commit;
- npm reports `xml2o@0.4.14` as `latest`;
- the publish run used provenance and no registry token secret.

## Out of Scope

- major, minor, prerelease, or arbitrary version selection;
- changing package code, public APIs, build artifacts, or dependencies;
- adding release-management or SemVer packages;
- creating GitHub Release notes;
- deleting or moving existing tags;
- publishing automatically when ordinary commits reach `main`.
