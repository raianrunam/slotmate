import Link from "next/link";
import {
  BarChart3Icon,
  CalendarClockIcon,
  CalendarCheckIcon,
  Building2Icon,
  GlobeIcon,
  PanelsTopLeftIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { PricingSection } from "@/components/pricing-section";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

// Marketing landing page. Placeholder copy: it has no data access.

const FEATURES: readonly { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Building2Icon,
    title: "Workspaces and resources",
    text: "Group what people can book, such as rooms, desks, equipment or appointments, into workspaces you control.",
  },
  {
    icon: CalendarClockIcon,
    title: "Weekly availability",
    text: "Set opening days and hours once. Time slots are cut from each resource's slot length.",
  },
  {
    icon: GlobeIcon,
    title: "A public booking page",
    text: "Share one link. Visitors pick a time and send a request without creating an account.",
  },
  {
    icon: CalendarCheckIcon,
    title: "Approve or reject",
    text: "Review every request in one list, filter by status, and keep two bookings from ever overlapping.",
  },
  {
    icon: BarChart3Icon,
    title: "Simple analytics",
    text: "See requests per day and by status. Pro adds monthly charts, resource usage and date filters.",
  },
  {
    icon: PanelsTopLeftIcon,
    title: "Embeddable widget",
    text: "Put your booking page on another website with a copy-and-paste snippet, in light or dark.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section aria-labelledby="hero-heading" className="border-b border-border">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center">
            <div>
              <h1
                id="hero-heading"
                className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl"
              >
                Bookings without the back-and-forth.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">
                SlotMate lets people request a time slot on your public page and
                lets you approve each request from one dashboard.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild className="h-11 px-5 text-base sm:h-10">
                  <Link href="/signup">Get started free</Link>
                </Button>
                <Button asChild variant="outline" className="h-11 px-5 text-base sm:h-10">
                  <Link href="/#pricing">See pricing</Link>
                </Button>
              </div>
            </div>
            {/* Decorative sketch of the booking page (hidden from screen readers). */}
            <div
              aria-hidden="true"
              className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <p className="text-sm font-medium">Meeting room A</p>
              <p className="text-xs text-muted-foreground">Sample slots, 60 minutes</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                {["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"].map((time, i) => (
                  <span
                    key={time}
                    className={
                      i === 1
                        ? "rounded-lg bg-primary px-3 py-2 text-center text-primary-foreground"
                        : "rounded-lg border border-border px-3 py-2 text-center"
                    }
                  >
                    {time}
                  </span>
                ))}
              </div>
              <div className="mt-4 h-9 rounded-lg bg-primary/10" />
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
          <PlaceholderNotice phase="Phase 18">
            The words on this landing page are a draft.
          </PlaceholderNotice>
        </div>

        <section id="features" aria-labelledby="features-heading" className="scroll-mt-20 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2
                id="features-heading"
                className="font-heading text-3xl font-semibold tracking-tight"
              >
                Everything for taking bookings
              </h2>
              <p className="mt-3 text-muted-foreground">
                From the first slot to the last approval, in one place.
              </p>
            </div>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title}>
                  <Card className="h-full">
                    <CardHeader className="gap-3">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <h3 className="font-heading text-base font-medium">{title}</h3>
                      <CardDescription>{text}</CardDescription>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="border-t border-border bg-muted/30">
          <PricingSection />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
