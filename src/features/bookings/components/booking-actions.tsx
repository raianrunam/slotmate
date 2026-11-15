"use client";

import { useActionState, useRef } from "react";
import { CheckIcon, Trash2Icon, XIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { approveBooking, cancelBooking, deleteBooking, rejectBooking } from "@/features/bookings/actions";
import { initialBookingActionState, type BookingActionState } from "@/features/bookings/state";

// The buttons on the details page (BOOK-03 to BOOK-06). Which ones show depends on the status:
//   pending  -> Approve, Reject          approved -> Cancel (asks first)        any -> Delete (asks first, D13)
// ONE form state serves all four buttons, so the message shown is always the answer to the LAST click
// (an old "already changed" sentence can never hide a newer one). A real <form> sits next to each
// confirmation dialog (the dialog is drawn in a layer above the page), and the dialog's button submits it.
// The server checks everything again; a refusal comes back as a fixed friendly sentence.
const ACTIONS = { approve: approveBooking, reject: rejectBooking, cancel: cancelBooking, delete: deleteBooking } as const;

async function run(_prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  const intent = formData.get("intent");
  const action = typeof intent === "string" && Object.hasOwn(ACTIONS, intent) ? ACTIONS[intent as keyof typeof ACTIONS] : null;
  if (!action) return { status: "error", message: "Something went wrong. Please try again." };
  return action(initialBookingActionState, formData);
}

export function BookingActions({ id, status, visitorName }: { id: string; status: "pending" | "approved" | "rejected" | "cancelled"; visitorName: string }) {
  const [state, submit, pending] = useActionState(run, initialBookingActionState);
  const cancelForm = useRef<HTMLFormElement>(null);
  const deleteForm = useRef<HTMLFormElement>(null);

  return (
    <div className="grid gap-3" data-testid="booking-actions">
      <div className="flex flex-wrap gap-2">
        {status === "pending" ? (
          <>
            <form action={submit}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="approve" />
              <Button type="submit" className="h-10 sm:h-8" disabled={pending}>
                <CheckIcon aria-hidden="true" /> Approve
              </Button>
            </form>
            <form action={submit}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="reject" />
              <Button type="submit" variant="outline" className="h-10 sm:h-8" disabled={pending}>
                <XIcon aria-hidden="true" /> Reject
              </Button>
            </form>
          </>
        ) : null}
        {status === "approved" ? (
          <>
            <form ref={cancelForm} action={submit}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="cancel" />
            </form>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" className="h-10 sm:h-8" disabled={pending}>
                  <XIcon aria-hidden="true" /> Cancel booking
                </Button>
              }
              title={`Cancel the booking of ${visitorName}?`}
              description="The booking is cancelled and its time becomes free for other visitors again. The visitor's status page will show it as cancelled."
              confirmLabel="Cancel booking"
              cancelLabel="Keep it"
              onConfirm={() => cancelForm.current?.requestSubmit()}
            />
          </>
        ) : null}
        <form ref={deleteForm} action={submit}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="intent" value="delete" />
        </form>
        <ConfirmDialog
          trigger={
            <Button type="button" variant="destructive" className="h-10 sm:h-8" disabled={pending} aria-label={`Delete booking of ${visitorName}`}>
              <Trash2Icon aria-hidden="true" /> Delete
            </Button>
          }
          title={`Delete the booking of ${visitorName}?`}
          description="This permanently deletes the booking request and its visitor details, and its time becomes free again. It still counts toward this month's request allowance. This cannot be undone."
          confirmLabel="Delete booking"
          onConfirm={() => deleteForm.current?.requestSubmit()}
        />
      </div>
      {pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Working…
        </p>
      ) : null}
      {state.message ? (
        <FormMessage tone="error" testId="booking-action-error">
          {state.message}
        </FormMessage>
      ) : null}
    </div>
  );
}
