import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/metadata/site-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms", "/opengraph-image", "/twitter-image"],
      disallow: ["/app", "/api", "/sign-in", "/sign-up", "/.well-known"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl.origin,
  };
}
