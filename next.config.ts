import type { NextConfig } from "next";
import { securityHeaderRules } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  // Clickjacking and sniffing protection on every page except the embeddable
  // widget, which must be framable by owners' websites (EMBED-*).
  async headers() {
    // The rules live in a plain module so a unit test can check them (Phase 14).
    return securityHeaderRules;
  },
  // Resource images are uploaded through a Server Action (S1). The default body
  // limit is 1 MB; an image may be 2 MB (2,097,152 bytes), so the limit is 2200 kB
  // (2,252,800 bytes): room for the form's own overhead, but no more, because the
  // limit applies to EVERY Server Action. The real 2 MB limit is checked in the
  // action; a file over about 2.15 MB is stopped by Next.js before our code runs,
  // and the form shows a friendly message for that (image-section.tsx).
  experimental: { serverActions: { bodySizeLimit: "2200kb" }, agentFeedback: false },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
