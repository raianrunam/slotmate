import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CalendarClockIcon, LockIcon } from "lucide-react";
import { OwnerGate } from "@/components/owner-gate";
import { PageHeader } from "@/components/page-header";
import { FormMessage } from "@/components/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteResourceButton } from "@/features/resources/components/delete-resource-button";
import { ImageSection } from "@/features/resources/components/image-section";
import { ResourceForm } from "@/features/resources/components/resource-form";
import { resourceFacts } from "@/features/resources/components/resource-summary";
import { getResource, publicImageUrl } from "@/features/resources/queries";
import { resourceIdSchema } from "@/features/resources/schema";

export const metadata: Metadata = { title: "Resource" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> };

async function ResourceContent({ params, searchParams }: Props) {
  const { id } = await params;
  const { notice } = await searchParams;
  if (!resourceIdSchema.safeParse(id).success) notFound();
  // RLS: another owner's resource is simply not found.
  const resource = await getResource(id);
  if (!resource) notFound();

  const workspace = resource.workspaces;
  const locked = resource.is_locked || (workspace?.is_locked ?? false);
  const imageUrl = publicImageUrl(resource.image_path);

  return (
    <>
      <PageHeader
        title={resource.name}
        description={locked ? "This resource is locked and read-only." : "Edit this resource."}
        actions={
          <>
            <Button asChild variant="outline" className="h-10 sm:h-8">
              <Link href={`/dashboard/resources/${resource.id}/availability`}>
                <CalendarClockIcon aria-hidden="true" /> {locked ? "View opening hours" : "Opening hours"}
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-10 sm:h-8">
              <Link href="/dashboard/resources">
                <ArrowLeftIcon aria-hidden="true" /> Resources
              </Link>
            </Button>
          </>
        }
      />
      {notice === "created" ? <FormMessage tone="success">Resource created. You can add an image below.</FormMessage> : null}
      {workspace ? (
        <p className="text-sm text-muted-foreground">
          In workspace{" "}
          <Link href={`/dashboard/workspaces/${workspace.id}`} className="font-medium text-foreground underline underline-offset-4">
            {workspace.name}
          </Link>
        </p>
      ) : null}

      {locked ? (
        <section aria-label="Locked resource" className="grid max-w-xl gap-4">
          <div>
            <Badge variant="secondary">
              <LockIcon aria-hidden="true" data-icon="inline-start" /> Locked (plan limit)
            </Badge>
          </div>
          <FormMessage tone="info">
            Your plan&apos;s limits were exceeded after a downgrade, so this resource is read-only and
            hidden from visitors. You can still delete it. Nothing is deleted automatically.
          </FormMessage>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Bookings</dt>
              <dd>{resourceFacts(resource)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Description</dt>
              <dd>{resource.description ?? "No description."}</dd>
            </div>
          </dl>
          <ImageSection resourceId={resource.id} resourceName={resource.name} imageUrl={imageUrl} locked />
        </section>
      ) : (
        <>
          <ResourceForm
            mode="edit"
            initial={{
              id: resource.id,
              name: resource.name,
              description: resource.description ?? "",
              slotMinutes: String(resource.slot_minutes),
              capacity: String(resource.capacity),
              isAvailable: resource.is_available,
            }}
          />
          <ImageSection resourceId={resource.id} resourceName={resource.name} imageUrl={imageUrl} locked={false} />
        </>
      )}

      <section aria-labelledby="danger-heading" className="grid max-w-xl gap-2 border-t border-border pt-5">
        <h2 id="danger-heading" className="font-heading text-base font-medium">
          Delete this resource
        </h2>
        <p className="text-sm text-muted-foreground">
          Permanently removes the resource with its opening hours, booking requests and image.
        </p>
        <div>
          <DeleteResourceButton id={resource.id} name={resource.name} />
        </div>
      </section>
    </>
  );
}

export default function ResourcePage(props: Props) {
  return (
    <OwnerGate>
      <ResourceContent {...props} />
    </OwnerGate>
  );
}
