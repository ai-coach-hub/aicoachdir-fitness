import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/siteUrl";

/**
 * Next generates /sitemap.xml from this file, and robots.txt points at it.
 *
 * Only pages that serve their own content are listed. Deliberately absent:
 *   /fitness              redirects to /
 *   /fitness/login        redirects out to the Pickaxe portal
 *   /sign-in, /sign-up    authentication screens, no reason to index
 *
 * A sitemap that lists redirects or auth screens teaches a crawler to distrust
 * it, which costs more than the extra entries are worth.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: `${SITE_ORIGIN}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_ORIGIN}/fitness/signup`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_ORIGIN}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
