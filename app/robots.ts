import type { MetadataRoute } from "next";

// /robots.txt returned 404. Absent robots is not neutral: crawlers apply their own defaults,
// and the sign-in/sign-up routes and the API have no business being indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/sign-in", "/sign-up"],
    },
    sitemap: "https://aicoachdir.com/sitemap.xml",
  };
}
