/**
 * The one origin the site is canonically served from.
 *
 * It is the WWW host, not the apex: https://aicoachdir.com answers with a 308
 * redirect to https://www.aicoachdir.com. A canonical URL, a sitemap entry or
 * a robots host that names the apex points search engines at a redirect rather
 * than at the page that actually serves, so every generated URL is built from
 * this constant.
 */
export const SITE_ORIGIN = "https://www.aicoachdir.com";
