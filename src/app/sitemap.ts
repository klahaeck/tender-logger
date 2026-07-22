import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/metadata/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const lastModified = new Date("2026-07-22T00:00:00.000Z");

  return [
    {
      url: new URL("/", siteUrl).toString(),
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: new URL("/pricing", siteUrl).toString(),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: new URL("/co-parenting-recordkeeping", siteUrl).toString(),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: new URL("/privacy", siteUrl).toString(),
      lastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: new URL("/terms", siteUrl).toString(),
      lastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];
}
