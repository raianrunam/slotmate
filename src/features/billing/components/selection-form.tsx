"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { saveDowngradeSelection } from "@/features/billing/downgrade-actions";
import { type SelectionFormState, type SelResource, type SelWorkspace } from "@/features/billing/schema";
import { PLAN_LIMITS } from "@/lib/plans";

const initial: SelectionFormState = { status: "idle" };
const MAX = PLAN_LIMITS.free.maxResources;

// The owner picks exactly one workspace and up to three resources inside it (S2).
// Nothing is pre-selected: the system never guesses what to keep (A18). The server
// checks everything again; this form only makes the right choice easy.
export function SelectionForm({
  workspaces,
  resources,
}: {
  workspaces: readonly SelWorkspace[];
  resources: readonly SelResource[];
}) {
  const [state, action, pending] = useActionState(saveDowngradeSelection, initial);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [picked, setPicked] = useState<string[]>([]);

  const inWorkspace = resources.filter((r) => r.workspace_id === workspaceId);

  return (
    <form action={action} className="grid gap-6" noValidate>
      {state.status === "error" && state.message ? (
        <FormMessage tone="error" testId="selection-error">
          {state.message}
        </FormMessage>
      ) : null}

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">1. Choose one workspace to keep active</legend>
        {workspaces.map((w) => (
          <label key={w.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
            <input
              type="radio"
              name="workspaceId"
              value={w.id}
              checked={workspaceId === w.id}
              onChange={() => {
                setWorkspaceId(w.id);
                setPicked([]);
              }}
              className="size-4"
            />
            <span className="font-medium">{w.name}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="grid gap-3" disabled={!workspaceId}>
        <legend className="mb-1 text-sm font-medium">
          2. Choose up to {MAX} resources from that workspace ({picked.length} of {MAX} chosen)
        </legend>
        {!workspaceId ? (
          <p className="text-sm text-muted-foreground">Choose a workspace first.</p>
        ) : inWorkspace.length === 0 ? (
          <p className="text-sm text-muted-foreground">This workspace has no resources. You can keep it as it is.</p>
        ) : (
          inWorkspace.map((r) => {
            const checked = picked.includes(r.id);
            return (
              <label key={r.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  name="resourceIds"
                  value={r.id}
                  checked={checked}
                  disabled={!checked && picked.length >= MAX}
                  onChange={(e) =>
                    setPicked((current) => (e.target.checked ? [...current, r.id] : current.filter((id) => id !== r.id)))
                  }
                  className="size-4"
                />
                <span className="font-medium">{r.name}</span>
              </label>
            );
          })
        )}
      </fieldset>

      <p className="text-sm text-muted-foreground">
        Everything else stays in your account, locked and hidden from visitors. Nothing is deleted. You can delete
        locked items yourself, or upgrade to Pro to unlock them again.
      </p>

      <Button type="submit" className="h-11 w-full sm:h-9 sm:w-fit" disabled={pending || !workspaceId}>
        {pending ? "Saving…" : "Keep this selection"}
      </Button>
    </form>
  );
}
