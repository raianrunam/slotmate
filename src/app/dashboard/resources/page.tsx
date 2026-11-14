import type { Metadata } from "next";
import { PackageIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata: Metadata = { title: "Resources" };

const SAMPLES = [
  { id: "meeting-room", name: "Meeting room", detail: "60-minute slots · up to 8 people", on: true },
  { id: "desk-4", name: "Desk 4", detail: "30-minute slots · 1 person", on: true },
  { id: "projector", name: "Projector", detail: "120-minute slots · 1 person", on: false },
] as const;

export default function ResourcesPage() {
  return (
    <>
      <PageHeader
        title="Resources"
        description="The things people can book: rooms, desks, equipment, appointments."
        actions={
          <Button className="h-10 sm:h-8" disabled>
            <PlusIcon aria-hidden="true" /> New resource
          </Button>
        }
      />
      <PlaceholderNotice phase="Phase 9" />
      <section aria-labelledby="samples-heading" className="grid gap-3">
        <h2 id="samples-heading" className="text-sm font-medium text-muted-foreground">
          What resources look like (sample)
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SAMPLES.map((resource) => (
            <li key={resource.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>{resource.name}</CardTitle>
                  <CardDescription>{resource.detail}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3">
                  <Label htmlFor={`available-${resource.id}`} className="text-sm">
                    Available for booking
                  </Label>
                  <Switch id={`available-${resource.id}`} defaultChecked={resource.on} disabled />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
      <EmptyState
        icon={PackageIcon}
        title="No resources yet"
        description="Add a resource, then set when it can be booked. This is how the list looks when it is empty."
      />
    </>
  );
}
