import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { relative, resolve, sep } from "node:path";

const root = resolve(execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim());
const entries = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const absolutePath = resolve(directory, entry.name);
    const relativePath = relative(root, absolutePath).split(sep).join("/");

    const ignore = spawnSync("git", ["check-ignore", "-q", "--no-index", "--", relativePath], { cwd: root });
    if (ignore.status === 0) continue;
    if (ignore.status !== 1) throw new Error(`git check-ignore failed for ${relativePath}`);

    const stat = await lstat(absolutePath);

    if (stat.isDirectory()) {
      await walk(absolutePath);
      continue;
    }

    const content = stat.isSymbolicLink() ? Buffer.from(await readlink(absolutePath)) : await readFile(absolutePath);
    const executable = (stat.mode & 0o111) !== 0;
    entries.push({ path: relativePath, executable, sha256: createHash("sha256").update(content).digest("hex") });
  }
}

await walk(root);
entries.sort((left, right) => left.path.localeCompare(right.path));
const tree = entries.map((entry) => `${entry.path}\0${entry.executable ? "x" : "-"}\0${entry.sha256}\n`).join("");
const fingerprint = createHash("sha256").update(tree).digest("hex");
console.log(JSON.stringify({
  algorithm: "sha256 of sorted UTF-8 path\0executable-bit\0sha256(file-bytes)\n records; walk filesystem, skip any .git directory, apply git check-ignore --no-index; does not consult Git index",
  fingerprint,
  fileCount: entries.length,
}, null, 2));
