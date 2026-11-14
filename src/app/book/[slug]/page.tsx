import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/form-field";
import { PageSkeleton } from "@/components/loading-skeletons";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { PublicHeader } from "@/components/public-header";

export const metadata: Metadata = { title: "Book a time" };

const RESOURCES = [
  { id: "room", name: "Meeting room", detail: "60 minutes · up to 8 people" },
  { id: "desk", name: "Desk 4", detail: "30 minutes · 1 person" },
] as const;

const SLOTS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"] as const;

// The route parameter is a Promise in this Next.js version, and with Cache
// Components it may only be read inside <Suspense>. So the page stays
// synchronous and a child component awaits it.
async function BookingShell({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Sample workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Booking address: <code className="font-mono">/book/{slug}</code>
        </p>
        {/* WORK-04: the page names the time zone every time is shown in. */}
        <p className="mt-1 text-sm text-muted-foreground">Times are shown in London time.</p>
      </div>

      <PlaceholderNotice phase="Phase 11">
        Choosing a time and sending a request are not built yet. The resources, times and form below are sample text.
      </PlaceholderNotice>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="grid gap-6">
          <section aria-labelledby="step-resource" className="grid gap-3">
            <h2 id="step-resource" className="font-heading text-lg font-medium">
              1. Choose a resource
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {RESOURCES.map((resource, i) => (
                <li key={resource.id}>
                  <Card className={i === 0 ? "border-primary ring-1 ring-primary" : undefined}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {resource.name}
                        {/* The selected state is also written, not only coloured. */}
                        {i === 0 ? <span className="text-xs font-normal text-primary">Selected</span> : null}
                      </CardTitle>
                      <CardDescription>{resource.detail}</CardDescription>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="step-time" className="grid gap-3">
            <h2 id="step-time" className="font-heading text-lg font-medium">
              2. Choose a date and time
            </h2>
            <FormField id="book-date" label="Date">
              {(props) => <Input {...props} type="date" disabled className="h-11 text-base sm:max-w-xs md:text-sm" />}
            </FormField>
            <ul aria-label="Available times (sample)" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {SLOTS.map((time, i) => (
                <li key={time}>
                  <Button
                    variant={i === 1 ? "default" : "outline"}
                    aria-pressed={i === 1}
                    className="h-11 w-full"
                    disabled
                  >
                    {time}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="font-heading text-lg font-medium">3. Your details</h2>
            </CardTitle>
            <CardDescription>No account needed.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" noValidate>
              <FormField id="book-name" label="Name">
                {(props) => <Input {...props} name="name" autoComplete="name" className="h-11 text-base md:text-sm" />}
              </FormField>
              <FormField id="book-email" label="Email">
                {(props) => <Input {...props} name="email" type="email" autoComplete="email" className="h-11 text-base md:text-sm" />}
              </FormField>
              <FormField id="book-phone" label="Phone" optional>
                {(props) => <Input {...props} name="phone" type="tel" autoComplete="tel" className="h-11 text-base md:text-sm" />}
              </FormField>
              <FormField id="book-attendees" label="Number of people" hint="Up to 8 for this resource.">
                {(props) => <Input {...props} name="attendees" type="number" min={1} max={8} defaultValue={1} className="h-11 text-base md:text-sm" />}
              </FormField>
              <FormField id="book-note" label="Note" optional>
                {(props) => <Textarea {...props} name="note" rows={3} className="text-base md:text-sm" />}
              </FormField>
              <Button type="submit" className="h-11" disabled>
                Request booking
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <>
      <PublicHeader />
      <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Suspense fallback={<PageSkeleton />}>
          <BookingShell params={params} />
        </Suspense>
      </main>
    </>
  );
}
