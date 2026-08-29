import type { MetadataRoute } from "next";

// Only the four pages a visitor should land on. /fitness redirects, /fitness/login redirects
// off-site to Pickaxe, and the auth routes are excluded in robots.ts — none belong here.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://aicoachdir.com";
  return [
    { url: base, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/fitness/signup`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
