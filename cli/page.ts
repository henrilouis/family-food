import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export const displayDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../display");

/** Bundles the Kitchen Display page's script into the single `page.js` that `index.html` loads. */
export async function buildPageScript(): Promise<string> {
  const result = await build({
    entryPoints: [path.join(displayDir, "src/main.ts")],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2020",
  });
  return result.outputFiles[0].text;
}

/** Writes the Kitchen Display page as static files (index.html, style.css, page.js) into `dir`. */
export async function writePage(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const file of ["index.html", "style.css"]) {
    await writeFile(path.join(dir, file), await readFile(path.join(displayDir, file)));
  }
  await writeFile(path.join(dir, "page.js"), await buildPageScript());
}
