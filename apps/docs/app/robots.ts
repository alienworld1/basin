import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const indexable = process.env.DOCS_DEPLOYMENT_CLASS !== "preview";
  return { rules: { userAgent: "*", allow: indexable ? "/" : "", disallow: indexable ? undefined : "/" }, sitemap: "/sitemap.xml" };
}
