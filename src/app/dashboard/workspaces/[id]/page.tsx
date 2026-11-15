import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, LockIcon } from "lucide-react";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { FormMessage } from "@/components/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteWorkspaceButton } from "@/features/workspaces/components/delete-workspace-button";
import { WorkspaceForm } from "@/features/workspaces/components/workspace-form";
import { WorkspaceResources } from "@/features/resources/components/workspace-resources";
import { getWorkspace } from "@/features/workspaces/queries";
import { listTimeZones, publicPath, workspaceIdSchema } from "@/features/workspaces/schema";
import { CopyAddress } from "@/features/workspaces/components/copy-address";

export const metadata: Metadata = { title: "Workspace" };

async function WorkspaceContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!workspaceIdSchema.safeParse(id).success) notFound();
  // RLS: another owner's workspace is simply not found.
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  return (
    <>
      <PageHeader
        title={workspace.name}
        description={workspace.is_locked ? "This workspace is locked and read-only." : "Edit this workspace."}
        actions={
          <Button asChild variant="outline" className="h-10 sm:h-8">
            <Link href="/dashboard/workspaces">
              <ArrowLeftIcon aria-hidden="true" /> Workspaces
            </Link>
          </Button>
        }
      />
      {workspace.is_locked ? (
        <section aria-label="Locked workspace" className="grid max-w-xl gap-4">
          <div>
            <Badge variant="secondary">
              <LockIcon aria-hidden="true" data-icon="inline-start" /> Locked (plan limit)
            </Badge>
          </div>
          <FormMessage tone="info">
            Your plan&apos;s limits were exceeded after a downgrade, so this workspace is read-only
            and hidden from visitors. You can still delete it. Nothing is deleted automatically.
          </FormMessage>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Public address</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{publicPath(workspace.slug)}</span>
                <CopyAddress path={publicPath(workspace.slug)} name={workspace.name} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Time zone</dt>
              <dd>{workspace.time_zone}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Description</dt>
              <dd>{workspace.description ?? "No description."}</dd>
            </div>
          </dl>
          <WorkspaceResources workspaceId={workspace.id} workspaceLocked />
          <div>
            <DeleteWorkspaceButton id={workspace.id} name={workspace.name} />
          </div>
        </section>
      ) : (
        <>
          <WorkspaceForm
            mode="edit"
            timeZones={listTimeZones()}
            initial={{
              id: workspace.id,
              name: workspace.name,
              description: workspace.description ?? "",
              slug: workspace.slug,
              timeZone: workspace.time_zone,
            }}
          />
          <WorkspaceResources workspaceId={workspace.id} workspaceLocked={false} />
          <section aria-labelledby="danger-heading" className="grid max-w-xl gap-2 border-t border-border pt-5">
            <h2 id="danger-heading" className="font-heading text-base font-medium">
              Delete this workspace
            </h2>
            <p className="text-sm text-muted-foreground">
              Permanently removes the workspace with its resources and their images, availability,
              booking requests and widget settings.
            </p>
            <div>
              <DeleteWorkspaceButton id={workspace.id} name={workspace.name} />
            </div>
          </section>
        </>
      )}
    </>
  );
}

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <OwnerGate>
      <WorkspaceContent params={params} />
    </OwnerGate>
  );
}
