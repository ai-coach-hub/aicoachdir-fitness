import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/siteUrl";

/**
 * Next generates /sitemap.xml from this file, and robots.txt points at it.
 *
 * Only pages we intentionally want search engines to discover and index
 * are listed here.
 *
 * Deliberately absent:
 *   /fitness              redirects to /
 *   /fitness/login        redirects out to the Pickaxe portal
 *   /fitness/signup       transactional signup page
 *   /sign-in, /sign-up    authentication screens
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
      url: `${SITE_ORIGIN}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
