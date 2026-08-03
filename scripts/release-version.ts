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

export interface PublicationInput {
    packageVersion: string;
    registryVersion: string;
    candidateExists: boolean;
}

export interface PublicationDecision {
    publishRequired: boolean;
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

export function resolvePublication(input: PublicationInput): PublicationDecision {
    parseStableVersion(input.packageVersion, "package.json");
    const expectedPatch = incrementPatch(input.registryVersion);

    if (input.packageVersion === input.registryVersion) {
        if (!input.candidateExists) {
            throw new Error(
                `Registry inconsistency: latest ${input.registryVersion} is missing from published versions`,
            );
        }

        return { publishRequired: false };
    }

    if (input.packageVersion === expectedPatch) {
        if (input.candidateExists) {
            throw new Error(
                `Cannot publish ${input.packageVersion}: version already exists but npm latest is ${input.registryVersion}`,
            );
        }

        return { publishRequired: true };
    }

    throw new Error(
        `Publication divergence: package.json=${input.packageVersion}, npm=${input.registryVersion}, expected patch=${expectedPatch}`,
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

    if (command === "publication") {
        requireArguments(command, values, 3);
        if (values[2] !== "true" && values[2] !== "false") {
            throw new Error("Usage error: publication candidate-exists must be true or false");
        }
        const decision = resolvePublication({
            packageVersion: values[0],
            registryVersion: values[1],
            candidateExists: values[2] === "true",
        });
        process.stdout.write(`publish-required=${decision.publishRequired}\n`);
        return;
    }

    throw new Error("Usage: release-version.ts next|resolve|publication");
}

if (import.meta.main) {
    try {
        runCli(process.argv.slice(2));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
