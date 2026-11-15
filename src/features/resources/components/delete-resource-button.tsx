"use client";

import { useActionState, useRef } from "react";
import { Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { deleteResource } from "@/features/resources/actions";
import { initialResourceState } from "@/features/resources/state";

// Delete is permanent and removes the bookings and the image too (D13), so it
// always goes through the confirmation dialog. The dialog is shown in a layer
// above the page, so the real form sits next to it and the dialog's button
// submits it.
export function DeleteResourceButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(deleteResource, initialResourceState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="grid gap-2">
      <form ref={formRef} action={action}>
        <input type="hidden" name="id" value={id} />
      </form>
      <ConfirmDialog
        trigger={
          <Button
            type="button"
            variant="destructive"
            className="h-10 sm:h-8"
            disabled={pending}
            aria-label={`Delete resource ${name}`}
          >
            <Trash2Icon aria-hidden="true" /> {pending ? "Deleting…" : "Delete"}
          </Button>
        }
        title={`Delete "${name}"?`}
        description="This permanently deletes the resource together with its opening hours, all its booking requests and its image. This cannot be undone."
        confirmLabel="Delete resource"
        onConfirm={() => formRef.current?.requestSubmit()}
      />
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
    </div>
  );
}
