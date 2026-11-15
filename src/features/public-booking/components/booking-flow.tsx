"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckIcon, ImageIcon } from "lucide-react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { loadDaySlots, submitBooking } from "@/features/public-booking/actions";
import {
  FIELD_NAMES,
  LIMITS,
  parseBooking,
  type BookingFormState,
  type FieldErrors,
  type FieldName,
  type PublicSlot,
  type RawFields,
} from "@/features/public-booking/schema";
import { dateLabel } from "@/lib/time/format";
import { cn } from "@/lib/utils";

// The booking flow (PUB-02 to PUB-07): choose a resource, choose a date, choose a
// free time, fill in the details, send. One reusable component: the public page
// uses it now and the widget (Phase 14, EMBED-01) reuses it, so both follow the
// same rules. It never decides anything itself: the free times and the booking come
// from the Server Actions, and the browser's checks are only for quick messages
// (SEC-02, "the server decides").
//
// Only the data a visitor may see arrives here (ISO-02): resource names, descriptions,
// images, capacities and slot lengths, and the free times of the chosen day.

export interface FlowResource {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  capacity: number;
  slotMinutes: number;
  /** "30 minutes per booking · up to 2 people" */
  facts: string;
}

type SlotResult = { key: string; slots: PublicSlot[] | null }; // slots null = the load failed

const FIELD_ID: Record<FieldName, string> = {
  resourceId: "step-resource",
  startsAt: "slot-group",
  name: "book-name",
  email: "book-email",
  phone: "book-phone",
  attendees: "book-attendees",
  note: "book-note",
};

// The order the fields appear on the page, for "focus the first problem".
const FIELD_ORDER: FieldName[] = ["resourceId", "startsAt", "name", "email", "attendees", "phone", "note"];

const inputClass = "h-11 text-base md:text-sm";

export function BookingFlow({
  resources,
  zoneLabel,
  minDate,
  maxDate,
  embed,
}: {
  resources: FlowResource[];
  zoneLabel: string;
  minDate: string;
  maxDate: string;
  /** Widget mode (Phase 14): a single column unless layout is "grid", and a success panel with a status link that opens in a new tab. Left out on the public page. */
  embed?: { layout: "list" | "grid" };
}) {
  const [statusPath, setStatusPath] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState(resources.length === 1 ? resources[0].id : "");
  const [date, setDate] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<SlotResult | null>(null);
  const [fields, setFields] = useState({ name: "", email: "", phone: "", attendees: "1", note: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ kind: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const resource = resources.find((r) => r.id === resourceId);
  const dateOk = date !== "" && date >= minDate && date <= maxDate;
  const key = `${resourceId}|${date}|${reload}`;

  // The free times of the chosen day, asked from the server (one day at a time).
  useEffect(() => {
    if (!resourceId || !dateOk) return;
    let cancelled = false;
    loadDaySlots(resourceId, date)
      .then((r) => !cancelled && setResult({ key, slots: r.ok ? r.slots : null }))
      .catch(() => !cancelled && setResult({ key, slots: null }));
    return () => {
      cancelled = true;
    };
  }, [key, resourceId, date, dateOk]);

  const slotState: "idle" | "loading" | "ready" | "error" =
    !resourceId || !dateOk ? "idle" : result?.key !== key ? "loading" : result.slots === null ? "error" : "ready";
  const slots = slotState === "ready" ? (result?.slots ?? []) : [];
  const chosen = slots.find((s) => s.startsAt === startsAt);

  const clearError = (name: FieldName) => setErrors((e) => ({ ...e, [name]: undefined }));
  const setField = (name: keyof typeof fields, value: string) => {
    setFields((f) => ({ ...f, [name]: value }));
    clearError(name);
  };

  function focusFirst(found: FieldErrors) {
    const first = FIELD_ORDER.find((name) => found[name]);
    if (first) document.getElementById(FIELD_ID[first])?.focus();
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); // the form is sent by the Server Action below, so typed text is never wiped
    if (pending) return;
    setFormError(null);

    const raw: RawFields = {
      resourceId,
      startsAt: chosen?.startsAt ?? "",
      name: fields.name,
      email: fields.email,
      phone: fields.phone,
      note: fields.note,
      attendees: fields.attendees,
    };
    // Quick checks with the SAME rules the server uses again.
    const checked = parseBooking(raw, resource?.capacity ?? 1000);
    if (!checked.ok) {
      setErrors(checked.errors);
      focusFirst(checked.errors);
      return;
    }
    setErrors({});

    const formData = new FormData();
    for (const name of FIELD_NAMES) formData.set(name, raw[name]);
    if (embed) formData.set("embed", "1");
    startTransition(async () => {
      let answer: BookingFormState;
      try {
        answer = await submitBooking(formData); // a success redirects and never returns
      } catch (error) {
        // A successful booking REDIRECTS, and in this Next.js version the redirect also rejects the
        // call. That is not a failure (Phase 11 review finding 1): let Next.js carry on to the status page.
        const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : "";
        if (digest.startsWith("NEXT_REDIRECT")) throw error;
        setFormError({ kind: "unknown", message: "Something went wrong. Please check your connection and try again." });
        return;
      }
      if (answer.status === "submitted") {
        // Only a path that starts with the status page's own address is ever shown as a link.
        if (/^\/booking\/[A-Za-z0-9_-]{43}\?submitted=1$/.test(answer.statusPath)) setStatusPath(answer.statusPath);
        return;
      }
      if (answer.status !== "error") return;
      if (answer.kind === "fields") {
        const found = answer.fieldErrors ?? {};
        setErrors(found);
        focusFirst(found);
        return;
      }
      setFormError({ kind: answer.kind, message: answer.message ?? "Something went wrong. Please try again." });
      if (answer.kind === "slot_taken" || answer.kind === "past" || answer.kind === "invalid_slot") {
        setStartsAt(""); // show the fresh list, so another time can be picked
        setReload((n) => n + 1);
      }
    });
  }

  if (statusPath) {
    return (
      <div role="status" className="grid gap-3 rounded-lg border border-border bg-card p-4" data-testid="embed-submitted">
        <h2 className="font-heading text-lg font-medium">Request sent</h2>
        <p className="text-sm text-muted-foreground">
          Your booking request was sent. Open your private status page to save the link and see whether it was approved.
          We do not send emails, so keep that link.
        </p>
        <Button asChild className="h-11 w-full sm:w-fit">
          <a href={statusPath} target="_blank" rel="noopener noreferrer" data-testid="embed-status-link">
            Open my status page (new tab)
          </a>
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={cn("grid gap-6", embed ? "" : "lg:grid-cols-[1fr_22rem] lg:items-start")}
      data-testid="booking-flow"
    >
      <div className="grid gap-6">
        {/* 1. resource */}
        <section aria-labelledby="step-resource-heading" className="grid gap-3">
          <h2 id="step-resource-heading" className="font-heading text-lg font-medium">
            1. Choose a resource
          </h2>
          <ul id="step-resource" tabIndex={-1} aria-label="Resources" className={cn("grid gap-3 outline-none", embed?.layout === "list" ? "" : "sm:grid-cols-2")}>
            {resources.map((r) => {
              const selected = r.id === resourceId;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setResourceId(r.id);
                      setStartsAt("");
                      clearError("resourceId");
                      clearError("attendees");
                    }}
                    className={cn(
                      "flex h-full w-full gap-3 rounded-xl border bg-card p-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected ? "border-primary ring-1 ring-primary" : "border-border",
                    )}
                  >
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageUrl} alt="" className="size-16 shrink-0 rounded-md border border-border object-cover" />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex size-16 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground"
                      >
                        <ImageIcon className="size-5" />
                      </span>
                    )}
                    <span className="grid min-w-0 gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {r.name}
                        {/* The selected state is also written, not only coloured. */}
                        {selected ? <span className="text-xs font-normal text-primary">Selected</span> : null}
                      </span>
                      <span className="text-sm text-muted-foreground">{r.facts}</span>
                      {r.description ? <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{r.description}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {errors.resourceId ? (
            <p role="alert" className="text-sm text-destructive">
              {errors.resourceId}
            </p>
          ) : null}
        </section>

        {/* 2. date and time */}
        <section aria-labelledby="step-time-heading" className="grid gap-3">
          <h2 id="step-time-heading" className="font-heading text-lg font-medium">
            2. Choose a date and time
          </h2>
          <FormField
            id="book-date"
            label="Date"
            hint={`From today up to 90 days ahead. Times are shown in ${zoneLabel}.`}
            error={date !== "" && !dateOk ? "Choose a date from today up to 90 days ahead." : undefined}
          >
            {(props) => (
              <Input
                {...props}
                type="date"
                min={minDate}
                max={maxDate}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setStartsAt("");
                }}
                className={cn(inputClass, "sm:max-w-xs")}
              />
            )}
          </FormField>

          <div id="slot-group" tabIndex={-1} role="group" aria-labelledby="slot-heading" className="grid gap-2 outline-none">
            <h3 id="slot-heading" className="text-sm font-medium">
              {dateOk ? `Free times on ${dateLabel(date)}` : "Free times"}
            </h3>
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite" data-testid="slot-status">
              {slotState === "idle" ? (resourceId ? "Choose a date to see the free times." : "Choose a resource, then a date.") : null}
              {slotState === "loading" ? "Loading free times…" : null}
              {slotState === "ready" && slots.length === 0 ? "No free times on this day. Try another date." : null}
              {slotState === "ready" && slots.length > 0 ? `${slots.length} free ${slots.length === 1 ? "time" : "times"}. Choose one.` : null}
              {slotState === "error" ? "Could not load the times." : null}
            </p>
            {slotState === "error" ? (
              <div>
                <Button type="button" variant="outline" className="h-10" onClick={() => setReload((n) => n + 1)}>
                  Try again
                </Button>
              </div>
            ) : null}
            {slots.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Free times">
                {slots.map((slot) => {
                  const selected = slot.startsAt === startsAt;
                  return (
                    <li key={slot.startsAt}>
                      <Button
                        type="button"
                        variant={selected ? "default" : "outline"}
                        aria-pressed={selected}
                        className="h-11 w-full"
                        onClick={() => {
                          setStartsAt(slot.startsAt);
                          clearError("startsAt");
                          setFormError(null);
                        }}
                      >
                        {selected ? <CheckIcon aria-hidden="true" /> : null}
                        {slot.start}
                        <span className="sr-only"> to {slot.end}</span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {errors.startsAt ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.startsAt}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {/* 3. details */}
      <section aria-labelledby="step-details-heading" className="grid gap-4 rounded-xl border border-border bg-card p-4">
        <div>
          <h2 id="step-details-heading" className="font-heading text-lg font-medium">
            3. Your details
          </h2>
          <p className="text-sm text-muted-foreground">No account needed.</p>
        </div>

        {chosen && resource ? (
          <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm" data-testid="booking-summary">
            {resource.name}: {dateLabel(date)}, {chosen.start} to {chosen.end} ({zoneLabel})
          </p>
        ) : null}

        <FormField id="book-name" label="Name" error={errors.name}>
          {(props) => (
            <Input {...props} name="name" autoComplete="name" maxLength={LIMITS.name + 50} value={fields.name} onChange={(e) => setField("name", e.target.value)} className={inputClass} />
          )}
        </FormField>
        <FormField id="book-email" label="Email" error={errors.email}>
          {(props) => (
            <Input
              {...props}
              name="email"
              type="email"
              autoComplete="email"
              value={fields.email}
              onChange={(e) => setField("email", e.target.value)}
              className={inputClass}
            />
          )}
        </FormField>
        <FormField
          id="book-attendees"
          label="Number of people"
          hint={resource ? (resource.capacity === 1 ? "This resource is for 1 person." : `Up to ${resource.capacity} for this resource.`) : "Choose a resource first."}
          error={errors.attendees}
        >
          {(props) => (
            <Input
              {...props}
              name="attendees"
              type="number"
              inputMode="numeric"
              min={1}
              max={resource?.capacity}
              value={fields.attendees}
              onChange={(e) => setField("attendees", e.target.value)}
              className={inputClass}
            />
          )}
        </FormField>
        <FormField id="book-phone" label="Phone" optional error={errors.phone}>
          {(props) => (
            <Input {...props} name="phone" type="tel" autoComplete="tel" value={fields.phone} onChange={(e) => setField("phone", e.target.value)} className={inputClass} />
          )}
        </FormField>
        <FormField id="book-note" label="Note" optional error={errors.note}>
          {(props) => (
            <Textarea {...props} name="note" rows={3} value={fields.note} onChange={(e) => setField("note", e.target.value)} className="text-base md:text-sm" />
          )}
        </FormField>

        {formError ? (
          <FormMessage tone="error" testId="booking-error">
            {formError.message}
          </FormMessage>
        ) : null}

        <Button type="submit" className="h-11" disabled={pending}>
          {pending ? "Sending…" : "Request booking"}
        </Button>
        <p className="text-xs text-muted-foreground">
          This sends a request. The owner approves or rejects it; you get a private link to check the answer.
        </p>
      </section>
    </form>
  );
}

