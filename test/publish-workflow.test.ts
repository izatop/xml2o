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
