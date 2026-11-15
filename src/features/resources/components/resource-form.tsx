"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createResource, updateResource } from "@/features/resources/actions";
import { ResourceLimitNotice } from "@/features/resources/components/limit-notice";
import {
  CAPACITY_MAX,
  CAPACITY_MIN,
  DESCRIPTION_MAX,
  NAME_MAX,
  SLOT_MAX,
  SLOT_MIN,
} from "@/features/resources/schema";
import { initialResourceState } from "@/features/resources/state";

export interface ResourceFormValues {
  id: string;
  name: string;
  description: string;
  slotMinutes: string;
  capacity: string;
  isAvailable: boolean;
}

// One form for both create and edit. Everything is controlled so the owner keeps
// what they typed when the server sends back an error. Whole-number fields are
// plain text boxes with a numeric keypad, so a wrong value reaches the server's
// own check and gets the same message there.
export function ResourceForm({
  mode,
  initial,
  workspaces,
  workspaceId,
}: {
  mode: "create" | "edit";
  initial?: ResourceFormValues;
  /** Create only: the workspaces the resource can go into. */
  workspaces?: { id: string; name: string }[];
  /** Create only: the workspace chosen in the link, when there is one. */
  workspaceId?: string;
}) {
  const [state, action, pending] = useActionState(
    mode === "create" ? createResource : updateResource,
    initialResourceState,
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [slot, setSlot] = useState(initial?.slotMinutes ?? "60");
  const [capacity, setCapacity] = useState(initial?.capacity ?? "1");
  const [available, setAvailable] = useState(initial?.isAvailable ?? true);
  const [workspace, setWorkspace] = useState(workspaceId ?? workspaces?.[0]?.id ?? "");

  return (
    <form action={action} className="grid max-w-xl gap-5" noValidate>
      {mode === "edit" && initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      {state.limitReached ? <ResourceLimitNotice /> : null}
      {state.message && !state.limitReached ? <FormMessage tone="error">{state.message}</FormMessage> : null}

      {mode === "create" ? (
        <FormField id="res-workspace" label="Workspace" error={state.fieldErrors?.workspaceId}>
          {(props) => (
            <select
              {...props}
              name="workspaceId"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            >
              {(workspaces ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
      ) : null}

      <FormField id="res-name" label="Name" error={state.fieldErrors?.name}>
        {(props) => (
          <Input
            {...props}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            autoComplete="off"
            className="h-10 text-base md:text-sm"
          />
        )}
      </FormField>

      <FormField id="res-description" label="Description" optional error={state.fieldErrors?.description}>
        {(props) => (
          <Textarea
            {...props}
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={3}
            className="text-base md:text-sm"
          />
        )}
      </FormField>

      <FormField
        id="res-slot"
        label="Slot length (minutes)"
        hint={`Each booking is exactly this long. From ${SLOT_MIN} to ${SLOT_MAX} minutes, for example 30, 60 or 120.`}
        error={state.fieldErrors?.slotMinutes}
      >
        {(props) => (
          <Input
            {...props}
            name="slotMinutes"
            inputMode="numeric"
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            autoComplete="off"
            className="h-10 text-base md:text-sm"
          />
        )}
      </FormField>

      <FormField
        id="res-capacity"
        label="Capacity (people per booking)"
        hint={`The largest number of people in one booking. From ${CAPACITY_MIN} to ${CAPACITY_MAX}.`}
        error={state.fieldErrors?.capacity}
      >
        {(props) => (
          <Input
            {...props}
            name="capacity"
            inputMode="numeric"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            autoComplete="off"
            className="h-10 text-base md:text-sm"
          />
        )}
      </FormField>

      <div className="flex items-start gap-2">
        <input
          id="res-available"
          type="checkbox"
          name="isAvailable"
          checked={available}
          onChange={(e) => setAvailable(e.target.checked)}
          aria-describedby="res-available-hint"
          className="mt-1 size-4"
        />
        <div className="grid gap-0.5">
          <label htmlFor="res-available" className="text-sm font-medium">
            Available for booking
          </label>
          <p id="res-available-hint" className="text-sm text-muted-foreground">
            Switch off to hide the resource from the public page. Existing bookings are not changed.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className="h-10 sm:h-8" disabled={pending}>
          {pending ? (mode === "create" ? "Creating…" : "Saving…") : mode === "create" ? "Create resource" : "Save changes"}
        </Button>
        <Button asChild variant="outline" className="h-10 sm:h-8">
          <Link href="/dashboard/resources">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
