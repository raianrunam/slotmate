"use client";

import Link from "next/link";
import { useActionState, useState, useSyncExternalStore } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createWorkspace, updateWorkspace } from "@/features/workspaces/actions";
import { WorkspaceLimitNotice } from "@/features/workspaces/components/limit-notice";
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  publicPath,
  slugify,
  slugProblem,
  SLUG_MAX,
} from "@/features/workspaces/schema";
import { initialWorkspaceState } from "@/features/workspaces/state";

export interface WorkspaceFormValues {
  id: string;
  name: string;
  description: string;
  slug: string;
  timeZone: string;
}

// The browser's own zone is only known in the browser, so the server render
// uses "" and React switches to the real value after hydration.
function subscribeNothing() {
  return () => {};
}
function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

const TIME_ZONE_LIST_ID = "time-zone-options";

// One form for both create and edit. Name, address and time zone are controlled
// so the owner keeps what they typed when the server sends back an error.
export function WorkspaceForm({
  mode,
  initial,
  timeZones,
}: {
  mode: "create" | "edit";
  initial?: WorkspaceFormValues;
  timeZones: readonly string[];
}) {
  const [state, action, pending] = useActionState(
    mode === "create" ? createWorkspace : updateWorkspace,
    initialWorkspaceState,
  );

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  // null = the owner has not typed in the address box (so it follows the name on create).
  const [typedSlug, setTypedSlug] = useState<string | null>(null);
  const [typedZone, setTypedZone] = useState<string | null>(null);

  const browserZone = useSyncExternalStore(subscribeNothing, browserTimeZone, () => "");
  const suggestedZone = timeZones.includes(browserZone) ? browserZone : "";

  const slug = typedSlug ?? (mode === "create" ? slugify(name) : (initial?.slug ?? ""));
  const timeZone = typedZone ?? (mode === "edit" ? (initial?.timeZone ?? "") : suggestedZone);

  const problem = slugProblem(slug);
  const zoneChanged =
    mode === "edit" && timeZone !== "" && timeZone !== initial?.timeZone && timeZones.includes(timeZone);

  return (
    <form action={action} className="grid max-w-xl gap-5" noValidate>
      {mode === "edit" && initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      {state.limitReached ? <WorkspaceLimitNotice /> : null}
      {state.message && !state.limitReached ? (
        <FormMessage tone="error">{state.message}</FormMessage>
      ) : null}

      <FormField id="ws-name" label="Name" error={state.fieldErrors?.name}>
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

      <FormField
        id="ws-slug"
        label="Public address"
        error={state.fieldErrors?.slug}
        hint={
          <span data-testid="slug-hint" aria-live="polite">
            {problem ? (
              problem
            ) : (
              <>
                Your public booking page will be at <code className="font-mono">{publicPath(slug)}</code>
              </>
            )}
          </span>
        }
      >
        {(props) => (
          <Input
            {...props}
            name="slug"
            value={slug}
            onChange={(e) => setTypedSlug(e.target.value)}
            maxLength={SLUG_MAX + 20}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="h-10 font-mono text-base md:text-sm"
          />
        )}
      </FormField>

      <FormField
        id="ws-time-zone"
        label="Time zone"
        error={state.fieldErrors?.timeZone}
        hint="Type to search, for example Europe/London. All times for this workspace are shown in this zone."
      >
        {(props) => (
          <>
            <Input
              {...props}
              name="timeZone"
              list={TIME_ZONE_LIST_ID}
              value={timeZone}
              onChange={(e) => setTypedZone(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-10 text-base md:text-sm"
            />
            <datalist id={TIME_ZONE_LIST_ID}>
              {timeZones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </>
        )}
      </FormField>

      {zoneChanged ? (
        <FormMessage tone="info" testId="time-zone-warning">
          Changing the time zone does not move existing bookings: each one keeps its exact
          moment in time, but the clock times shown for it will shift to the new zone. Check
          your opening hours after saving.
        </FormMessage>
      ) : null}

      <FormField id="ws-description" label="Description" optional error={state.fieldErrors?.description}>
        {(props) => (
          <Textarea
            {...props}
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={4}
            className="text-base md:text-sm"
          />
        )}
      </FormField>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className="h-10 sm:h-8" disabled={pending}>
          {pending
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
              ? "Create workspace"
              : "Save changes"}
        </Button>
        <Button asChild variant="outline" className="h-10 sm:h-8">
          <Link href="/dashboard/workspaces">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
