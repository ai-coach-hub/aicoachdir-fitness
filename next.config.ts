import type { NextConfig } from "next";

/**
 * Security response headers.
 *
 * `frame-ancestors 'none'` (plus the legacy X-Frame-Options for older agents) is the
 * load-bearing one: /fitness/signup carries the Terms consent checkbox and the button that
 * sends a customer to payment. Without it that page can be embedded in a hostile iframe and
 * those two clicks harvested, which would produce a consent record that looks valid and is not.
 *
 * Deliberately NOT a full content-security-policy. A restrictive script-src would need
 * nonces threaded through Next's inline bootstrap and would risk breaking the Pickaxe
 * redirect. Shipping frame protection now is worth more than shipping a broken page later;
 * a full CSP is a separate, testable piece of work.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
