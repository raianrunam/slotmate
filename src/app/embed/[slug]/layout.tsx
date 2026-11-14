import type { Metadata } from "next";

// The widget frame: no header, no footer, no navigation. It will be shown inside
// another website's iframe (EMBED-02), so it keeps the page chrome to a minimum.
// (The rule that only /embed pages may be framed is added in Phase 14.)
export const metadata: Metadata = {
  title: "Booking widget",
  robots: { index: false, follow: false },
};

export default function EmbedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="flex min-h-screen flex-1 flex-col bg-background">{children}</div>;
}
