/**
 * Minimal syntax gate for the server.
 *
 * The backend has no ESLint config, so instead of adding a linter the CI
 * pipeline parses every source file with the real V8 module parser. Anything
 * that would crash at import time fails the build here instead of in prod.
 */
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
const SKIP = new Set(["node_modules", ".git", "dist", "coverage", "scripts"]);

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(full)));
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

const files = await collect(ROOT);
const failures = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  try {
    // Compiles (parses + resolves syntax) without executing any module body.
    new vm.SourceTextModule(source, { identifier: pathToFileURL(file).href });
  } catch (error) {
    failures.push({ file: path.relative(ROOT, file), message: error.message });
  }
}

if (failures.length) {
  console.error(`\nSyntax check failed for ${failures.length} file(s):\n`);
  for (const { file, message } of failures) console.error(`  ${file}\n    ${message}\n`);
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} server file(s).`);
