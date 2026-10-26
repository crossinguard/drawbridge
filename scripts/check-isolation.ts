/**
 * The reference material must stay outside the app, run with:
 * `bun ./scripts/check-isolation.ts`
 *
 * The `reference/` folder holds real course exports and the requirements
 * they were read against. It is input for building the tools, not part of
 * them. Deleting it must change nothing about how the app builds, runs, or
 * tests — so this check makes sure nothing under `src/` or `public/` reaches
 * for it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

/** Folders the app is built from. */
const APP_DIRS = ["src", "public"];

/**
 * Paths that would mean the app depends on the reference material.
 *
 * The `.imscc` extension is not one of them: the app is allowed to talk
 * about the format. What it may not do is reach into the folder that holds
 * the real course exports.
 */
const FORBIDDEN = [/assets\/reference\//, /[^a-zA-Z]reference\//, /\.\.\/reference\//];

let failures = 0;

/** Every file under a folder, as paths relative to the repository root. */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const out: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".astro" || entry === "dist") continue;

    const absolute = join(dir, entry);
    if (statSync(absolute).isDirectory()) {
      out.push(...walk(absolute));
    } else {
      out.push(relative(ROOT, absolute));
    }
  }

  return out;
}

console.log("\nReference material isolation");

for (const dir of APP_DIRS) {
  const files = walk(join(ROOT, dir));

  for (const file of files) {
    // Binary files cannot hold a path to the reference folder.
    if (/\.(png|jpe?g|gif|svg|webp|woff2?|ico|docx|pdf|mp4|mov|mp3)$/i.test(file)) continue;

    const source = readFileSync(join(ROOT, file), "utf8");

    for (const pattern of FORBIDDEN) {
      if (!pattern.test(source)) continue;

      failures++;
      console.error(`  FAIL — ${file} refers to the reference material (${pattern})`);
    }
  }
}

// The reference folder itself must not be part of the build output.
if (existsSync(join(ROOT, "dist"))) {
  const built = walk(join(ROOT, "dist"));
  for (const file of built) {
    if (!/reference|\.imscc/i.test(file)) continue;
    failures++;
    console.error(`  FAIL — ${file} was written into the build output`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} problem(s) found. The reference material must stay outside the app.`);
  process.exit(1);
}

console.log("  ok — nothing in the app refers to the reference material");
