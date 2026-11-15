import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { WorkspaceLimitNotice } from "@/features/workspaces/components/limit-notice";
import { WorkspaceForm } from "@/features/workspaces/components/workspace-form";
import { getWorkspaceUsage } from "@/features/workspaces/queries";
import { listTimeZones } from "@/features/workspaces/schema";

export const metadata: Metadata = { title: "New workspace" };

async function NewWorkspaceContent() {
  const usage = await getWorkspaceUsage();
  return (
    <>
      <PageHeader
        title="New workspace"
        description="Choose a name, a public address and the time zone your bookings use."
        actions={
          <Button asChild variant="outline" className="h-10 sm:h-8">
            <Link href="/dashboard/workspaces">
              <ArrowLeftIcon aria-hidden="true" /> Workspaces
            </Link>
          </Button>
        }
      />
      {usage.atLimit ? (
        <WorkspaceLimitNotice used={usage.used} max={usage.max} />
      ) : (
        <WorkspaceForm mode="create" timeZones={listTimeZones()} />
      )}
    </>
  );
}

export default function NewWorkspacePage() {
  return (
    <OwnerGate>
      <NewWorkspaceContent />
    </OwnerGate>
  );
}
