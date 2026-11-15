import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/form-message";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { SelectionForm } from "@/features/billing/components/selection-form";
import { getDowngradeState } from "@/features/billing/queries";

export const metadata: Metadata = { title: "Choose what to keep" };

async function DowngradeContent() {
  const state = await getDowngradeState();
  return (
    <>
      <PageHeader
        title="Choose what to keep"
        description="The Free plan allows 1 workspace and 3 resources. Choose which ones stay active."
      />
      {state.needed ? (
        <Card>
          <CardHeader>
            <CardTitle>Your selection</CardTitle>
            <CardDescription>Nothing is deleted. Anything you do not choose is locked and hidden from visitors.</CardDescription>
          </CardHeader>
          <CardContent>
            <SelectionForm workspaces={state.workspaces} resources={state.resources} />
          </CardContent>
        </Card>
      ) : (
        <FormMessage tone="info" testId="selection-not-needed">
          There is nothing to choose right now. <Link href="/dashboard/billing" className="font-medium underline">Back to billing</Link>.
        </FormMessage>
      )}
    </>
  );
}

export default function DowngradePage() {
  return (
    <OwnerGate>
      <DowngradeContent />
    </OwnerGate>
  );
}
