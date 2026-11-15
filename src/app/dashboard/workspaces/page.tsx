import type { Metadata } from "next";
import Link from "next/link";
import { Building2Icon, LockIcon, PencilIcon, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FormMessage } from "@/components/form-message";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { workspaceUsageLabel } from "@/lib/plans";
import { DeleteWorkspaceButton } from "@/features/workspaces/components/delete-workspace-button";
import { WorkspaceLimitNotice } from "@/features/workspaces/components/limit-notice";
import { getWorkspaceUsage, listWorkspaces } from "@/features/workspaces/queries";
import { publicPath } from "@/features/workspaces/schema";

export const metadata: Metadata = { title: "Workspaces" };

const NOTICES: Record<string, string> = {
  created: "Workspace created.",
  saved: "Changes saved.",
  deleted: "Workspace deleted.",
};

type SearchParams = Promise<{ page?: string; notice?: string }>;

async function WorkspacesContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [usage, list] = await Promise.all([
    getWorkspaceUsage(),
    listWorkspaces(Number.parseInt(params.page ?? "1", 10)),
  ]);
  const notice = params.notice ? NOTICES[params.notice] : undefined;
  const anyLocked = list.rows.some((w) => w.is_locked);

  return (
    <>
      <PageHeader
        title="Workspaces"
        description="A workspace has its own public booking address and time zone."
        actions={
          usage.atLimit ? (
            <Button className="h-10 sm:h-8" disabled>
              <PlusIcon aria-hidden="true" /> New workspace
            </Button>
          ) : (
            <Button asChild className="h-10 sm:h-8">
              <Link href="/dashboard/workspaces/new">
                <PlusIcon aria-hidden="true" /> New workspace
              </Link>
            </Button>
          )
        }
      />
      {notice ? <FormMessage tone="success">{notice}</FormMessage> : null}
      <p className="text-sm text-muted-foreground" data-testid="workspace-usage">
        {workspaceUsageLabel(usage.used, usage.max)}
        {usage.plan === "free" ? " on the Free plan" : " on the Pro plan"}
      </p>
      {usage.atLimit ? <WorkspaceLimitNotice used={usage.used} max={usage.max} /> : null}
      {anyLocked ? (
        <FormMessage tone="info">
          Some workspaces are locked because your plan&apos;s limits were exceeded after a
          downgrade. A locked workspace is read-only and hidden from visitors. You can still
          delete it. Nothing is deleted automatically.
        </FormMessage>
      ) : null}

      {list.total === 0 ? (
        <EmptyState
          icon={Building2Icon}
          title="No workspaces yet"
          description="Create your first workspace to start taking bookings."
          action={
            <Button asChild className="h-10">
              <Link href="/dashboard/workspaces/new">
                <PlusIcon aria-hidden="true" /> New workspace
              </Link>
            </Button>
          }
        />
      ) : (
        <section aria-label="Your workspaces" className="grid gap-3">
          <ul className="grid gap-3">
            {list.rows.map((workspace) => (
              <li key={workspace.id}>
                <Card data-testid="workspace-card">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <h2 className="font-heading text-base font-medium">{workspace.name}</h2>
                      {workspace.is_locked ? (
                        <Badge variant="secondary">
                          <LockIcon aria-hidden="true" data-icon="inline-start" /> Locked (plan limit)
                        </Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription>
                      <span className="font-mono">{publicPath(workspace.slug)}</span> ·{" "}
                      {workspace.time_zone} time
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 max-w-prose text-sm text-muted-foreground">
                      {workspace.description ?? "No description."}
                    </p>
                    <div className="flex flex-wrap items-start gap-2">
                      <Button asChild variant="outline" className="h-10 sm:h-8">
                        <Link
                          href={`/dashboard/workspaces/${workspace.id}`}
                          aria-label={`${workspace.is_locked ? "View" : "Edit"} workspace ${workspace.name}`}
                        >
                          <PencilIcon aria-hidden="true" /> {workspace.is_locked ? "View" : "Edit"}
                        </Link>
                      </Button>
                      <DeleteWorkspaceButton id={workspace.id} name={workspace.name} />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination
            page={list.page}
            totalItems={list.total}
            buildHref={(p) => `/dashboard/workspaces?page=${p}`}
          />
        </section>
      )}
    </>
  );
}

// Every dashboard page checks the owner first (A3 layer 2). A unit test enforces this.
export default function WorkspacesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OwnerGate>
      <WorkspacesContent searchParams={searchParams} />
    </OwnerGate>
  );
}
