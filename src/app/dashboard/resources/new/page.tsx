import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ResourceLimitNotice } from "@/features/resources/components/limit-notice";
import { ResourceForm } from "@/features/resources/components/resource-form";
import { getResourceUsage, listWorkspaceChoices } from "@/features/resources/queries";
import { resourceIdSchema } from "@/features/resources/schema";

export const metadata: Metadata = { title: "New resource" };

async function NewResourceContent({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const { workspace } = await searchParams;
  const [usage, all] = await Promise.all([getResourceUsage(), listWorkspaceChoices()]);
  // A locked workspace cannot receive new resources (the database refuses it too).
  const choices = all.filter((w) => !w.is_locked);
  const chosen = workspace && resourceIdSchema.safeParse(workspace).success && choices.some((w) => w.id === workspace)
    ? workspace
    : undefined;

  return (
    <>
      <PageHeader
        title="New resource"
        description="Choose a workspace, a name, how long one booking lasts and how many people fit."
        actions={
          <Button asChild variant="outline" className="h-10 sm:h-8">
            <Link href="/dashboard/resources">
              <ArrowLeftIcon aria-hidden="true" /> Resources
            </Link>
          </Button>
        }
      />
      {usage.atLimit ? (
        <ResourceLimitNotice used={usage.used} max={usage.max} />
      ) : choices.length === 0 ? (
        <EmptyState
          title="You need a workspace first"
          description="A resource lives inside a workspace that can take new resources. Create one first."
          action={
            <Button asChild className="h-10">
              <Link href="/dashboard/workspaces/new">New workspace</Link>
            </Button>
          }
        />
      ) : (
        <ResourceForm mode="create" workspaces={choices} workspaceId={chosen} />
      )}
    </>
  );
}

export default function NewResourcePage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  return (
    <OwnerGate>
      <NewResourceContent searchParams={searchParams} />
    </OwnerGate>
  );
}
