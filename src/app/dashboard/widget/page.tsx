import type { Metadata } from "next";
import Link from "next/link";
import { LayoutTemplateIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { EmbedCode } from "@/features/embed/components/embed-code";
import { WidgetForm } from "@/features/embed/components/widget-form";
import { getWidgetOptions, listWidgetWorkspaces } from "@/features/embed/queries";
import { embedPath, workspaceIdSchema } from "@/features/embed/schema";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Widget" };

type SearchParams = Promise<{ workspace?: string | string[] }>;

async function WidgetContent({ searchParams }: { searchParams: SearchParams }) {
  const { workspace: requested } = await searchParams;
  const workspaces = await listWidgetWorkspaces();

  if (workspaces.length === 0) {
    return (
      <>
        <PageHeader title="Widget" description="Show your booking page on another website with a snippet you paste in." />
        <EmptyState
          icon={LayoutTemplateIcon}
          title="No workspace yet"
          description="Create a workspace first. Its booking page can then be shown on another website."
          action={
            <Button asChild className="h-10">
              <Link href="/dashboard/workspaces/new">New workspace</Link>
            </Button>
          }
        />
      </>
    );
  }

  // Only the owner's own workspaces can be chosen (the list came from their own session).
  // An unknown, foreign or malformed ?workspace= falls back to the first one.
  const wanted = typeof requested === "string" && workspaceIdSchema.safeParse(requested).success ? requested : null;
  const current = workspaces.find((w) => w.id === wanted) ?? workspaces[0];
  const { options, plan } = await getWidgetOptions(current.id);
  const previewKey = `${current.id}-${options.theme}-${options.layout}-${options.backgroundColor ?? "none"}`;

  return (
    <>
      <PageHeader title="Widget" description="Show your booking page on another website with a snippet you paste in." />

      {workspaces.length > 1 ? (
        <nav aria-label="Choose a workspace" className="flex flex-wrap gap-2">
          {workspaces.map((w) => (
            <Button
              key={w.id}
              asChild
              variant={w.id === current.id ? "default" : "outline"}
              className="h-10 sm:h-8"
            >
              <Link href={`/dashboard/widget?workspace=${w.id}`} aria-current={w.id === current.id ? "page" : undefined}>
                {w.name}
              </Link>
            </Button>
          ))}
        </nav>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Choose how the widget for <strong className="[overflow-wrap:anywhere]">{current.name}</strong> looks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* key: the form starts again from the saved values when another workspace is chosen */}
            <WidgetForm key={current.id} workspaceId={current.id} saved={options} isPro={plan === "pro"} locked={current.isLocked} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Live preview</CardTitle>
            <CardDescription>
              This is the widget as visitors see it with your <em>saved</em> options. Save to update it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <iframe
              key={previewKey}
              src={embedPath(current.slug)}
              title="Widget preview"
              data-testid="widget-preview"
              className={cn("h-[640px] w-full rounded-lg border border-border bg-background")}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Embed code</CardTitle>
          <CardDescription>
            Copy this into the page where the widget should appear. It only holds the public address of your widget and its
            size, so changing the options here needs no new code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmbedCode slug={current.slug} />
        </CardContent>
      </Card>
    </>
  );
}

// Every dashboard page checks the owner first (A3 layer 2). A unit test enforces this.
export default function WidgetPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OwnerGate>
      <WidgetContent searchParams={searchParams} />
    </OwnerGate>
  );
}
