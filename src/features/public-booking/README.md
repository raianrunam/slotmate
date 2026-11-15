The public booking feature (Phase 11): the public page `/book/[slug]`, the status page `/booking/[code]`, and the booking submission.

- `schema.ts` (shared): the form rules and the types. Limits match the database CHECKs.
- `errors.ts`: database error names to friendly messages.
- `queries.ts` (server-only, admin connection, reads only): the public workspace, one day of free slots, and the status of one booking by the hash of its secret code.
- `actions.ts` (server-only, "use server"): `submitBooking` (rate limit, validation, secret code, `submit_booking`) and `loadDaySlots`.
- `components/booking-flow.tsx`: the reusable booking flow (the Phase 14 widget reuses it). `components/status-link.tsx`: the private link shown once.
