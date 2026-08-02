import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageRoot = process.cwd();
const temporaryDirectory = await mkdtemp(join(tmpdir(), "xml2o-package-consumer-"));

async function run(command: string[], cwd: string): Promise<string> {
    const child = Bun.spawn(command, { cwd, stderr: "pipe", stdout: "pipe" });
    const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);

    if (exitCode !== 0) {
        throw new Error(`${command.join(" ")} failed in ${cwd}:\n${stdout}${stderr}`);
    }

    return stdout;
}

async function packedPackageDirectory(directory: string): Promise<string> {
    const packageDirectory = join(directory, "package");

    try {
        await access(join(packageDirectory, "package.json"));
        return packageDirectory;
    } catch {
        return directory;
    }
}

try {
    const tarball = join(temporaryDirectory, "xml2o.tgz");
    const unpackedDirectory = join(temporaryDirectory, "unpacked");

    await run([process.execPath, "pm", "pack", "--filename", tarball], packageRoot);
    await mkdir(unpackedDirectory);
    const artifactList = (await run(["tar", "-tzf", tarball], packageRoot))
        .trim()
        .split("\n")
        .filter(Boolean)
        .sort();
    await run(["tar", "-xzf", tarball, "-C", unpackedDirectory], packageRoot);

    const packedDirectory = await packedPackageDirectory(unpackedDirectory);
    const packedPackageJson = JSON.parse(
        await readFile(join(packedDirectory, "package.json"), "utf8"),
    );
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

    const expectedArtifacts = [
        "package/LICENSE",
        "package/README.md",
        "package/dist/index.cjs",
        "package/dist/index.cjs.map",
        "package/dist/index.mjs",
        "package/dist/index.mjs.map",
        "package/dist/types/index.d.ts",
        "package/dist/types/node/index.d.ts",
        "package/package.json",
    ];
    if (JSON.stringify(artifactList) !== JSON.stringify(expectedArtifacts)) {
        throw new Error(`Unexpected packed artifacts: ${artifactList.join(", ")}`);
    }

    const consumerDirectory = join(temporaryDirectory, "consumer");
    await mkdir(consumerDirectory);
    await writeFile(
        join(consumerDirectory, "package.json"),
        JSON.stringify({
            private: true,
            type: "module",
            dependencies: { xml2o: "file:../xml2o.tgz" },
        }),
    );
    const consumerNodeModules = join(consumerDirectory, "node_modules");
    await mkdir(join(consumerNodeModules, "xml2o"), { recursive: true });
    await run(
        ["tar", "-xzf", tarball, "--strip-components=1", "-C", join(consumerNodeModules, "xml2o")],
        packageRoot,
    );
    await symlink(
        join(packageRoot, "node_modules", "sax"),
        join(consumerNodeModules, "sax"),
        "dir",
    );
    await mkdir(join(consumerNodeModules, "@types"));
    await symlink(
        join(packageRoot, "node_modules", "@types", "node"),
        join(consumerNodeModules, "@types", "node"),
        "dir",
    );

    await writeFile(
        join(consumerDirectory, "esm-consumer.mjs"),
        [
            'import {Attribute, Node, convertStream, convertString} from "xml2o";',
            'if (typeof Attribute !== "function" || typeof Node !== "function" || typeof convertStream !== "function" || typeof convertString !== "function") throw new Error("Missing ESM named export");',
            'if (!(await convertString("<root />")) instanceof Node) throw new Error("ESM conversion did not return Node");',
        ].join("\n"),
    );
    await writeFile(
        join(consumerDirectory, "cjs-consumer.cjs"),
        [
            'const {Attribute, Node, convertStream, convertString} = require("xml2o");',
            "(async () => {",
            '    if (typeof Attribute !== "function" || typeof Node !== "function" || typeof convertStream !== "function" || typeof convertString !== "function") throw new Error("Missing CJS named export");',
            '    if (!(await convertString("<root />")) instanceof Node) throw new Error("CJS conversion did not return Node");',
            "})().catch((error) => {",
            "    console.error(error);",
            "    process.exitCode = 1;",
            "});",
        ].join("\n"),
    );
    await writeFile(
        join(consumerDirectory, "type-consumer.ts"),
        [
            'import {Attribute, Node, convertStream, convertString} from "xml2o";',
            'const node: Node = await convertString("<root />");',
            "const attributeConstructor: typeof Attribute = Attribute;",
            "const streamConverter: typeof convertStream = convertStream;",
            "void node;",
            "void attributeConstructor;",
            "void streamConverter;",
        ].join("\n"),
    );
    await writeFile(
        join(consumerDirectory, "tsconfig.json"),
        JSON.stringify({
            compilerOptions: {
                module: "esnext",
                moduleResolution: "bundler",
                noEmit: true,
                strict: true,
                target: "esnext",
                types: ["node"],
            },
            include: ["type-consumer.ts"],
        }),
    );

    await run(["node", "esm-consumer.mjs"], consumerDirectory);
    await run(["node", "cjs-consumer.cjs"], consumerDirectory);
    await run(
        [join(packageRoot, "node_modules", ".bin", "tsc"), "-p", "tsconfig.json"],
        consumerDirectory,
    );
} finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
}
