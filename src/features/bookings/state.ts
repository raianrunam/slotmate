// What a booking Server Action returns to its button. Never contains raw database text.
export interface BookingActionState {
  status: "idle" | "error";
  message?: string;
}

export const initialBookingActionState: BookingActionState = { status: "idle" };
