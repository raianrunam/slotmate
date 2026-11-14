import type { Metadata } from "next";
import { Building2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PlaceholderNotice } from "@/components/placeholder-notice";

export const metadata: Metadata = { title: "Workspaces" };

export default function WorkspacesPage() {
  return (
    <>
      <PageHeader
        title="Workspaces"
        description="A workspace has its own public booking address and time zone."
        actions={
          <Button className="h-10 sm:h-8" disabled>
            <PlusIcon aria-hidden="true" /> New workspace
          </Button>
        }
      />
      <PlaceholderNotice phase="Phase 8" />
      <section aria-labelledby="sample-heading" className="grid gap-3">
        <h2 id="sample-heading" className="text-sm font-medium text-muted-foreground">
          What a workspace looks like (sample)
        </h2>
        <Card>
          <CardHeader>
            <CardTitle>Sample workspace</CardTitle>
            <CardDescription>/book/sample-workspace · Europe/London time</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">2 resources · 3 pending requests</p>
            {/* Deleting is permanent and removes everything underneath (D13). */}
            <ConfirmDialog
              trigger={
                <Button variant="destructive" className="h-10 sm:h-8">
                  <Trash2Icon aria-hidden="true" /> Delete
                </Button>
              }
              title="Delete this workspace?"
              description="This permanently deletes the workspace together with all its resources, availability and booking requests. This cannot be undone."
              confirmLabel="Delete workspace"
            />
          </CardContent>
        </Card>
      </section>
      <EmptyState
        icon={Building2Icon}
        title="No workspaces yet"
        description="Create your first workspace to start taking bookings. This is how the list looks when it is empty."
        action={
          <Button className="h-10" disabled>
            <PlusIcon aria-hidden="true" /> New workspace
          </Button>
        }
      />
    </>
  );
}
