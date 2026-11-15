import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResourceBadges, ResourceThumb, resourceFacts } from "@/features/resources/components/resource-summary";
import { getResourceUsage, listResources } from "@/features/resources/queries";
import { resourceUsageLabel } from "@/lib/plans";

// The "Resources" section of a workspace's page (the workspace links to its
// resources, and each resource links back).
export async function WorkspaceResources({ workspaceId, workspaceLocked }: { workspaceId: string; workspaceLocked: boolean }) {
  const [usage, list] = await Promise.all([getResourceUsage(), listResources(1, workspaceId)]);
  const canAdd = !workspaceLocked && !usage.atLimit;

  return (
    <section aria-labelledby="ws-resources-heading" className="grid max-w-xl gap-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ws-resources-heading" className="font-heading text-base font-medium">
          Resources in this workspace
        </h2>
        {canAdd ? (
          <Button asChild variant="outline" className="h-10 sm:h-8">
            <Link href={`/dashboard/resources/new?workspace=${workspaceId}`}>
              <PlusIcon aria-hidden="true" /> Add resource
            </Link>
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {resourceUsageLabel(usage.used, usage.max)} across all your workspaces.
        {!workspaceLocked && usage.atLimit ? " You have reached the limit, so no more can be added." : ""}
      </p>
      {list.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No resources in this workspace yet.</p>
      ) : (
        <ul className="grid gap-2" data-testid="workspace-resource-list">
          {list.rows.map((resource) => (
            <li key={resource.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
              <ResourceThumb resource={resource} />
              <div className="grid min-w-0 gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/dashboard/resources/${resource.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {resource.name}
                  </Link>
                  <ResourceBadges resource={resource} />
                </span>
                <span className="text-sm text-muted-foreground">{resourceFacts(resource)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.total > list.rows.length ? (
        <p className="text-sm text-muted-foreground">
          Showing {list.rows.length} of {list.total}.{" "}
          <Link href="/dashboard/resources" className="underline underline-offset-4">
            See all resources
          </Link>
        </p>
      ) : null}
    </section>
  );
}
