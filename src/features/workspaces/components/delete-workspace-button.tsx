"use client";

import { useActionState, useRef } from "react";
import { Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { deleteWorkspace } from "@/features/workspaces/actions";
import { initialWorkspaceState } from "@/features/workspaces/state";

// Delete is permanent and removes everything underneath (D13), so it always
// goes through the confirmation dialog. The dialog is shown in a layer above the
// page, so the real form sits next to it and the dialog's button submits it.
export function DeleteWorkspaceButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(deleteWorkspace, initialWorkspaceState);
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
            aria-label={`Delete workspace ${name}`}
          >
            <Trash2Icon aria-hidden="true" /> {pending ? "Deleting…" : "Delete"}
          </Button>
        }
        title={`Delete "${name}"?`}
        description="This permanently deletes the workspace together with all its resources, availability, booking requests and widget settings. This cannot be undone."
        confirmLabel="Delete workspace"
        onConfirm={() => formRef.current?.requestSubmit()}
      />
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
    </div>
  );
}
