import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { DOCS_PATHS } from "../lib/navigation";

const root = join(import.meta.dirname, "..");
const contentRoot = join(root, "content");
const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : entry.name.endsWith(".mdx") ? [join(directory, entry.name)] : []);
const fail = (message: string): never => { throw new Error(message); };
const paths = new Set(DOCS_PATHS);
const titles = new Set<string>();

for (const file of files(contentRoot)) {
  const source = readFileSync(file, "utf8");
  const relativeFile = relative(contentRoot, file);
  const match = source.match(/^---\ntitle: (.+)\ndescription: (.+)\n---\n\n# (.+)$/m);
  if (!match) {
    fail(`Documentation page is missing required metadata or content: /${relativeFile.replace(/index\.mdx$/, "").replace(/\.mdx$/, "")}.`);
  }
  const [, title, description, h1] = match!;
  if (!h1 || !description || titles.has(title)) fail(`Documentation page is missing required metadata or content: /${relativeFile}.`);
  titles.add(title);
  for (const href of source.matchAll(/\]\((\/[^)#?]*)[^)]*\)/g)) if (!paths.has(href[1] as (typeof DOCS_PATHS)[number])) fail(`Broken documentation link: /${relativeFile} → ${href[1]}.`);
  if (source.includes("@basin/sdk")) fail(`Stale package reference: /${relativeFile}.`);
}

for (const path of DOCS_PATHS) {
  const directFile = path === "/" ? "index.mdx" : `${path.slice(1)}.mdx`;
  const indexFile = path === "/" ? directFile : join(path.slice(1), "index.mdx");
  if (!existsSync(join(contentRoot, directFile)) && !existsSync(join(contentRoot, indexFile))) fail(`Documentation page is missing required metadata or content: ${path}.`);
}

console.log(`Validated ${titles.size} documentation pages and ${DOCS_PATHS.length} required routes.`);
