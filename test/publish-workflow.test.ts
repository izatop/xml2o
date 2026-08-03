import { describe, expect, test } from "bun:test";

const workflow = await Bun.file(
    new URL("../.github/workflows/publish.yml", import.meta.url),
).text();

interface WorkflowStep {
    name?: string;
    run?: string;
    uses?: string;
}

interface WorkflowJob {
    if?: string;
    needs?: string | string[];
    permissions?: Record<string, string>;
    steps?: WorkflowStep[];
}

const parsed = Bun.YAML.parse(workflow) as { jobs: Record<string, WorkflowJob> };
const jobs = parsed.jobs;

function steps(jobName: string): WorkflowStep[] {
    return jobs[jobName]?.steps ?? [];
}

function combinedRun(jobName: string): string {
    return steps(jobName)
        .map((step) => step.run ?? "")
        .join("\n");
}

describe("Publish workflow", () => {
    test("uses only an input-free workflow dispatch trigger", () => {
        expect(workflow).toContain("workflow_dispatch:");
        expect(workflow).not.toContain("repository_dispatch:");
        expect(workflow).not.toContain("inputs:");
        expect(workflow).not.toMatch(/^\s+push:\s*$/m);
    });

    test("rejects unsupported refs and serializes release runs", () => {
        expect(jobs["validate-dispatch"]).toBeDefined();
        expect(combinedRun("validate-dispatch")).toContain("Unsupported publish ref");
        expect(workflow).toContain("group: publish-${{ github.repository }}");
        expect(workflow).toContain("cancel-in-progress: false");
    });

    test("keeps write, verification, and OIDC permissions separate", () => {
        expect(jobs["validate-dispatch"].permissions).toEqual({});
        expect(jobs["prepare-release"].permissions).toEqual({
            actions: "write",
            contents: "write",
        });
        expect(jobs["verify-release"].permissions).toEqual({ contents: "read" });
        expect(jobs.publish.permissions).toEqual({
            actions: "read",
            "id-token": "write",
        });
        expect(workflow.match(/id-token: write/g) ?? []).toHaveLength(1);
    });

    test("verifies and packs before entering the OIDC job", () => {
        const verifyRun = combinedRun("verify-release");
        const verifyUses = steps("verify-release").map((step) => step.uses ?? "");

        expect(verifyRun).toContain('git cat-file -t "refs/tags/$RELEASE_TAG"');
        expect(verifyRun).toContain("bun ci");
        expect(verifyRun).toContain("bun run security");
        expect(verifyRun).toContain("bun run check");
        expect(verifyRun).toContain('npm view "$package_name" version versions --json');
        expect(verifyRun).toContain("publication");
        expect(verifyRun).toContain("npm pack --ignore-scripts --json");
        expect(verifyUses).toContain(
            "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
        );
    });

    test("publishes only the verified artifact without repository scripts", () => {
        const publishRun = combinedRun("publish");
        const publishUses = steps("publish").map((step) => step.uses ?? "");

        expect(jobs.publish.if).toContain("publish-required == 'true'");
        expect(publishUses).toContain(
            "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
        );
        expect(publishUses.some((use) => use.startsWith("actions/checkout@"))).toBe(false);
        expect(publishUses.some((use) => use.startsWith("oven-sh/setup-bun@"))).toBe(false);
        expect(publishRun).not.toContain("bun");
        expect(publishRun).toContain("sha256sum --check package.sha256");
        expect(publishRun).toContain('npm publish "$archive" --ignore-scripts --provenance');
        expect(workflow).not.toContain("NPM_TOKEN");
    });

    test("uses atomic refs and dispatches the exact tag", () => {
        expect(combinedRun("prepare-release")).toContain(
            'git push --atomic origin HEAD:refs/heads/main "refs/tags/$RELEASE_TAG"',
        );
        expect(combinedRun("prepare-release")).toContain(
            "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/actions/workflows/publish.yml/dispatches",
        );
    });
});
