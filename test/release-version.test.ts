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
