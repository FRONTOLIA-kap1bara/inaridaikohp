import { existsSync, readFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const requiredVersion = readFileSync(join(root, ".node-version"), "utf8").trim();
const [requiredMajor, requiredMinor, requiredPatch] = requiredVersion.split(".").map(Number);
const isSupported = (version) => {
  const [major, minor, patch] = version.trim().replace(/^v/, "").split(".").map(Number);
  return major === requiredMajor &&
    (minor > requiredMinor || (minor === requiredMinor && patch >= requiredPatch));
};

let node = process.execPath;
if (!isSupported(process.versions.node)) {
  const platform = process.platform === "win32" ? "win" : process.platform;
  const localNode = join(root, ".tools", `node-v${requiredVersion}-${platform}-${process.arch}`,
    process.platform === "win32" ? "node.exe" : "bin/node");
  if (!existsSync(localNode) || !isSupported(execFileSync(localNode, ["--version"], { encoding: "utf8" }))) {
    console.error(`Node.js ${requiredVersion} 以上の ${requiredMajor} 系で起動してください。現在: ${process.versions.node}`);
    process.exit(1);
  }
  node = localNode;
  console.log(`[dev] プロジェクト内の Node.js ${requiredVersion} を使用します。`);
}

const child = spawn(node, [join(root, "node_modules/astro/bin/astro.mjs"), "dev", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PATH: `${dirname(node)}${delimiter}${process.env.PATH ?? ""}` }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
child.once("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
});
