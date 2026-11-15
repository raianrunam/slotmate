import { ImageIcon, LockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { publicImageUrl, type ResourceRow } from "@/features/resources/queries";
import { minutesLabel } from "@/features/resources/schema";

// Small shared pieces of the resource list (used on the resources page and on
// the workspace page). Server components, no secrets.

export function ResourceThumb({ resource }: { resource: Pick<ResourceRow, "image_path" | "name"> }) {
  const url = publicImageUrl(resource.image_path);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="size-14 shrink-0 rounded-md border border-border object-cover" />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-14 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground"
    >
      <ImageIcon className="size-5" />
    </span>
  );
}

export function ResourceBadges({ resource }: { resource: Pick<ResourceRow, "is_locked" | "is_available"> }) {
  return (
    <>
      {resource.is_locked ? (
        <Badge variant="secondary">
          <LockIcon aria-hidden="true" data-icon="inline-start" /> Locked (plan limit)
        </Badge>
      ) : null}
      {!resource.is_available ? <Badge variant="outline">Unavailable</Badge> : null}
    </>
  );
}

export function resourceFacts(resource: Pick<ResourceRow, "slot_minutes" | "capacity">): string {
  return `${minutesLabel(resource.slot_minutes)} per booking · up to ${resource.capacity} ${resource.capacity === 1 ? "person" : "people"}`;
}
