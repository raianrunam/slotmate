// The HTTP header rules of next.config.ts, in a plain module so a unit test can check
// them. No imports: next.config.ts loads this file by a relative path.
//
// Order semantics (Next.js "Header Overriding Behavior"): if two rules match the same path
// and set the same header, the LAST one wins. To avoid depending on order, the rules do not
// overlap: the general rule uses a negative look-ahead that skips /embed and /booking (the bare word and
// everything under it). Checked in the unit tests against the same regular expressions Next.js builds, and
// on a real server in the UI tests (Phase 14 review: the first version let bare /embed match two rules and
// /booking/a/b match none).
//  * /embed/*   : the widget. Frameable by any website (EMBED-02). No X-Frame-Options.
//  * /booking/* : the private status page. Never framed, never cached (A8).
//  * everything else: never framed (clickjacking protection).

export interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

export const EMBED_SOURCE = "/embed/:path*";
export const BOOKING_SOURCE = "/booking/:path*";
export const GENERAL_SOURCE = "/((?!embed(?:/|$)|booking(?:/|$)).*)";

export const securityHeaderRules: HeaderRule[] = [
  {
    // The widget: it must be shown inside other websites' iframes.
    source: EMBED_SOURCE,
    headers: [
      { key: "Content-Security-Policy", value: "frame-ancestors *" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ],
  },
  {
    // The private status page (A8): never cached, never reveals its address to other sites.
    source: BOOKING_SOURCE,
    headers: [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ],
  },
  {
    source: GENERAL_SOURCE,
    headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ],
  },
];
