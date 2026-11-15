import type { Metadata } from "next";

// The widget frame: no header, no footer, no navigation. It will be shown inside
// another website's iframe (EMBED-02), so it keeps the page chrome to a minimum.
// Only /embed pages may be framed: the rule is in src/lib/security-headers.ts.
export const metadata: Metadata = {
  title: "Booking widget",
  robots: { index: false, follow: false },
};

export default function EmbedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="flex min-h-screen flex-1 flex-col bg-background">{children}</div>;
}
