import type { Metadata } from "next";
import Link from "next/link";
import { PackageIcon, PencilIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FormMessage } from "@/components/form-message";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { resourceUsageLabel } from "@/lib/plans";
import { DeleteResourceButton } from "@/features/resources/components/delete-resource-button";
import { ResourceLimitNotice } from "@/features/resources/components/limit-notice";
import { ResourceBadges, ResourceThumb, resourceFacts } from "@/features/resources/components/resource-summary";
import { getResourceUsage, listResources } from "@/features/resources/queries";

export const metadata: Metadata = { title: "Resources" };

const NOTICES: Record<string, string> = {
  created: "Resource created.",
  saved: "Changes saved.",
  deleted: "Resource deleted.",
};

type SearchParams = Promise<{ page?: string; notice?: string }>;

async function ResourcesContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [usage, list] = await Promise.all([
    getResourceUsage(),
    listResources(Number.parseInt(params.page ?? "1", 10)),
  ]);
  const notice = params.notice && Object.hasOwn(NOTICES, params.notice) ? NOTICES[params.notice] : undefined;
  const anyLocked = list.rows.some((r) => r.is_locked);

  return (
    <>
      <PageHeader
        title="Resources"
        description="A resource is something visitors can book, such as a room, a desk or a person."
        actions={
          usage.atLimit ? (
            <Button className="h-10 sm:h-8" disabled>
              <PlusIcon aria-hidden="true" /> New resource
            </Button>
          ) : (
            <Button asChild className="h-10 sm:h-8">
              <Link href="/dashboard/resources/new">
                <PlusIcon aria-hidden="true" /> New resource
              </Link>
            </Button>
          )
        }
      />
      {notice ? <FormMessage tone="success">{notice}</FormMessage> : null}
      <p className="text-sm text-muted-foreground" data-testid="resource-usage">
        {resourceUsageLabel(usage.used, usage.max)}
        {usage.plan === "free" ? " on the Free plan" : " on the Pro plan"} (all workspaces together)
      </p>
      {usage.atLimit ? <ResourceLimitNotice used={usage.used} max={usage.max} /> : null}
      {anyLocked ? (
        <FormMessage tone="info">
          Some resources are locked because your plan&apos;s limits were exceeded after a downgrade.
          A locked resource is read-only and hidden from visitors. You can still delete it. Nothing
          is deleted automatically.
        </FormMessage>
      ) : null}

      {list.total === 0 ? (
        <EmptyState
          icon={PackageIcon}
          title="No resources yet"
          description="Create a resource inside one of your workspaces so visitors can book it."
          action={
            <Button asChild className="h-10">
              <Link href="/dashboard/resources/new">
                <PlusIcon aria-hidden="true" /> New resource
              </Link>
            </Button>
          }
        />
      ) : (
        <section aria-label="Your resources" className="grid gap-3">
          <ul className="grid gap-3">
            {list.rows.map((resource) => (
              <li key={resource.id}>
                <Card data-testid="resource-card">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <ResourceThumb resource={resource} />
                      <div className="grid min-w-0 gap-1">
                        <CardTitle className="flex flex-wrap items-center gap-2">
                          <h2 className="font-heading text-base font-medium">{resource.name}</h2>
                          <ResourceBadges resource={resource} />
                        </CardTitle>
                        <CardDescription>
                          {resourceFacts(resource)}
                          {resource.workspaces ? (
                            <>
                              {" "}
                              · in{" "}
                              <Link
                                href={`/dashboard/workspaces/${resource.workspaces.id}`}
                                className="font-medium text-foreground underline underline-offset-4"
                              >
                                {resource.workspaces.name}
                              </Link>
                            </>
                          ) : null}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 max-w-prose text-sm text-muted-foreground">
                      {resource.description ?? "No description."}
                    </p>
                    <div className="flex flex-wrap items-start gap-2">
                      <Button asChild variant="outline" className="h-10 sm:h-8">
                        <Link
                          href={`/dashboard/resources/${resource.id}`}
                          aria-label={`${resource.is_locked ? "View" : "Edit"} resource ${resource.name}`}
                        >
                          <PencilIcon aria-hidden="true" /> {resource.is_locked ? "View" : "Edit"}
                        </Link>
                      </Button>
                      <DeleteResourceButton id={resource.id} name={resource.name} />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination
            page={list.page}
            totalItems={list.total}
            buildHref={(p) => `/dashboard/resources?page=${p}`}
          />
        </section>
      )}
    </>
  );
}

// Every dashboard page checks the owner first (A3 layer 2). A unit test enforces this.
export default function ResourcesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OwnerGate>
      <ResourcesContent searchParams={searchParams} />
    </OwnerGate>
  );
}
