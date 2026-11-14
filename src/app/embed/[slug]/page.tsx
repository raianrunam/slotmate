import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoMark } from "@/components/logo";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { TableSkeleton } from "@/components/loading-skeletons";

const RESOURCES = [
  { id: "room", name: "Meeting room", detail: "60 minutes · up to 8 people" },
  { id: "desk", name: "Desk 4", detail: "30 minutes · 1 person" },
] as const;

// The widget shell. The theme follows the viewer's light or dark setting here;
// in Phase 14 the owner's saved theme (EMBED-04) decides.
async function WidgetShell({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">Book a time</h1>
        <p className="text-sm text-muted-foreground">
          Workspace address: <code className="font-mono">{slug}</code>
        </p>
      </div>
      <PlaceholderNotice phase="Phase 14">
        This is a sketch of the widget. Nothing here can be booked yet.
      </PlaceholderNotice>
      <ul className="grid gap-3">
        {RESOURCES.map((resource) => (
          <li key={resource.id}>
            <Card>
              <CardHeader className="gap-1">
                <CardTitle>{resource.name}</CardTitle>
                <CardDescription>{resource.detail}</CardDescription>
              </CardHeader>
              <div className="px-4 pb-4">
                <Button className="h-11 w-full sm:h-9 sm:w-fit" disabled>
                  Choose a time
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main id="main-content" className="mx-auto w-full max-w-xl flex-1 px-4 py-5">
      <Suspense fallback={<TableSkeleton rows={2} />}>
        <WidgetShell params={params} />
      </Suspense>
      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <LogoMark className="size-4" />
        Powered by SlotMate
      </p>
    </main>
  );
}
