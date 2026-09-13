import type { MetadataRoute } from "next";
import { DOCS_PATHS } from "../lib/navigation";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_DOCS_URL ?? "http://localhost:3001";
  return DOCS_PATHS.map((path) => ({ url: new URL(path, base).toString(), lastModified: new Date("2026-09-13") }));
}
