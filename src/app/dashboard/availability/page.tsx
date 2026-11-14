import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-header";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata: Metadata = { title: "Availability" };

// ISO weekdays: Monday is 1 and Sunday is 7 (DATABASE.md DB9). One window per day.
const DAYS = [
  { n: 1, name: "Monday", open: true },
  { n: 2, name: "Tuesday", open: true },
  { n: 3, name: "Wednesday", open: true },
  { n: 4, name: "Thursday", open: true },
  { n: 5, name: "Friday", open: true },
  { n: 6, name: "Saturday", open: false },
  { n: 7, name: "Sunday", open: false },
] as const;

export default function AvailabilityPage() {
  return (
    <>
      <PageHeader
        title="Availability"
        description="Choose the days a resource can be booked and its opening hours. Times are in the workspace's time zone."
      />
      <PlaceholderNotice phase="Phase 10" />
      <Card>
        <CardHeader>
          <CardTitle>Weekly schedule (sample)</CardTitle>
          <CardDescription>One opening window per day. A day that is switched off is closed.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {DAYS.map((day) => (
              <li
                key={day.n}
                className="grid gap-3 py-4 sm:grid-cols-[10rem_1fr] sm:items-center"
              >
                <div className="flex items-center justify-between gap-3 sm:justify-start">
                  <Label htmlFor={`open-${day.n}`} className="text-sm font-medium">
                    {day.name}
                  </Label>
                  <Switch id={`open-${day.n}`} defaultChecked={day.open} disabled />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`opens-${day.n}`} className="text-sm text-muted-foreground">
                      {day.name} opens at
                    </Label>
                    <Input id={`opens-${day.n}`} type="time" defaultValue="09:00" disabled className="h-10 text-base md:text-sm" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`closes-${day.n}`} className="text-sm text-muted-foreground">
                      {day.name} closes at
                    </Label>
                    <Input id={`closes-${day.n}`} type="time" defaultValue="17:00" disabled className="h-10 text-base md:text-sm" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
