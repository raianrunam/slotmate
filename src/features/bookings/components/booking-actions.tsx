"use client";

import { useActionState, useRef } from "react";
import { CheckIcon, Trash2Icon, XIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { approveBooking, cancelBooking, deleteBooking, rejectBooking } from "@/features/bookings/actions";
import { initialBookingActionState } from "@/features/bookings/state";

// The buttons on the details page (BOOK-03 to BOOK-06). Which ones show depends on the status:
//   pending  -> Approve, Reject          approved -> Cancel (asks first)        any -> Delete (asks first, D13)
// A real <form> sits next to each confirmation dialog (the dialog is drawn in a layer above the page),
// and the dialog's button submits it. The server checks everything again; a refusal comes back as a
// fixed friendly sentence shown under the buttons.
export function BookingActions({ id, status, visitorName }: { id: string; status: "pending" | "approved" | "rejected" | "cancelled"; visitorName: string }) {
  const [approveState, approve, approving] = useActionState(approveBooking, initialBookingActionState);
  const [rejectState, reject, rejecting] = useActionState(rejectBooking, initialBookingActionState);
  const [cancelState, cancel, cancelling] = useActionState(cancelBooking, initialBookingActionState);
  const [deleteState, remove, deleting] = useActionState(deleteBooking, initialBookingActionState);
  const cancelForm = useRef<HTMLFormElement>(null);
  const deleteForm = useRef<HTMLFormElement>(null);
  const busy = approving || rejecting || cancelling || deleting;
  const message = approveState.message ?? rejectState.message ?? cancelState.message ?? deleteState.message;

  return (
    <div className="grid gap-3" data-testid="booking-actions">
      <div className="flex flex-wrap gap-2">
        {status === "pending" ? (
          <>
            <form action={approve}>
              <input type="hidden" name="id" value={id} />
              <Button type="submit" className="h-10 sm:h-8" disabled={busy}>
                <CheckIcon aria-hidden="true" /> {approving ? "Approving…" : "Approve"}
              </Button>
            </form>
            <form action={reject}>
              <input type="hidden" name="id" value={id} />
              <Button type="submit" variant="outline" className="h-10 sm:h-8" disabled={busy}>
                <XIcon aria-hidden="true" /> {rejecting ? "Rejecting…" : "Reject"}
              </Button>
            </form>
          </>
        ) : null}
        {status === "approved" ? (
          <>
            <form ref={cancelForm} action={cancel}>
              <input type="hidden" name="id" value={id} />
            </form>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" className="h-10 sm:h-8" disabled={busy}>
                  <XIcon aria-hidden="true" /> {cancelling ? "Cancelling…" : "Cancel booking"}
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
        <form ref={deleteForm} action={remove}>
          <input type="hidden" name="id" value={id} />
        </form>
        <ConfirmDialog
          trigger={
            <Button type="button" variant="destructive" className="h-10 sm:h-8" disabled={busy} aria-label={`Delete booking of ${visitorName}`}>
              <Trash2Icon aria-hidden="true" /> {deleting ? "Deleting…" : "Delete"}
            </Button>
          }
          title={`Delete the booking of ${visitorName}?`}
          description="This permanently deletes the booking request and its visitor details, and its time becomes free again. It still counts toward this month's request allowance. This cannot be undone."
          confirmLabel="Delete booking"
          onConfirm={() => deleteForm.current?.requestSubmit()}
        />
      </div>
      {message ? (
        <FormMessage tone="error" testId="booking-action-error">{message}</FormMessage>
      ) : null}
    </div>
  );
}
