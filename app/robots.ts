import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/siteUrl";

/**
 * Next generates /robots.txt from this file.
 *
 * Before this, /robots.txt returned 404, so crawlers arrived with no
 * directives and no pointer to a sitemap. Everything here is permissive —
 * the point is not to restrict anything, it is to declare where the map is.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
