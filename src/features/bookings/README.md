# Bookings (Phase 12)

The owner's booking management: the list at `/dashboard/bookings`, the details page at
`/dashboard/bookings/[id]`, the four actions (approve, reject, cancel, delete), the pending-request
badge (header bell and the Bookings menu item) and the real numbers on the overview (`/dashboard`).

Requirements: BOOK-01 to BOOK-08, NOTIF-02, NOTIF-03 (owner's success messages), DASH-03, DASH-04, DASH-06.
Decisions: D10, D13, D15 (in-app notifications only, no emails), D19, D21 (20 per page), D25 (5 recent items), Q9.

## Files

| File | What it does |
|---|---|
| `schema.ts` | Pure rules: `parseListParams` (status, search, page from the address), `listHref`, `escapeLike`, `postgrestQuote`, `containsPattern`, `bookingIdSchema`, `TRANSITIONS`. |
| `queries.ts` | Server-only reads with the OWNER's session (RLS): `listBookings`, `getBooking`, `getPendingCount`, `getRecentActivity`, `getPendingRequests`, `getOverviewStats`. |
| `actions.ts` | Server Actions `approveBooking`, `rejectBooking`, `cancelBooking`, `deleteBooking`. |
| `db-errors.ts` | Fixed friendly sentences and `mapBookingError` / `explainNoChange` (pure, unit tested). |
| `format.ts` | Times in the workspace's named zone, the status history text (pure). |
| `state.ts` | What an action returns to its button. |
| `components/` | `booking-table` (list), `booking-filters` (status toggle buttons and search, plain GET forms), `booking-actions` (buttons and confirmation dialogs). |

## How it works

- **Only the owner's session.** Every read and write uses the logged-in owner's own connection, so row
  level security decides what exists for them. The secret key is not used here (a unit test checks it).
  Another owner's booking is simply "not found".
- **Status changes.** Each action is `update ... where id = ? and status = <the status the action starts from>`.
  Approve and reject start from `pending`, cancel starts from `approved`. The database trigger
  `enforce_booking_transition` is the real guard for the allowed path. If two tabs act at once, the second finds
  no row and the owner sees "This booking was already changed. Reload the page to see its status."
- **Nothing changed?** An update or delete that touches no row was hidden by RLS or did not match. The action
  re-reads the booking with the owner's session and explains it: not found, locked (read-only), already changed.
- **Locked items (Q9).** A booking whose resource or workspace is locked after a downgrade shows no action buttons
  and an explanation; the database refuses its update and delete too.
- **Search (BOOK-08, DB13).** Visitor name, visitor email or resource name, `ILIKE`. The text is trimmed, cut to
  100 characters, `%`, `_` and `\` are escaped (they are ordinary letters), and the value is quoted for the filter
  list (commas, brackets, dots and quotes are ordinary text). Resource names are looked up first (the owner's
  resources only, at most 200) and their ids join the filter.
- **Address.** `?status=&q=&page=` is the whole state; the forms are plain GET forms, so everything works without
  JavaScript and the back button behaves. A change of filter or search drops the page. A page past the end shows
  the last page.
- **Pending badge (NOTIF-02).** `getPendingCount` is cached per request; the header bell and the menu item both
  show it. Every action revalidates the dashboard layout, so the number is current on the next page.
- **Overview.** "Approved this month" counts approved bookings whose `updated_at` is in the current UTC month (an
  approved booking changes again only when it is cancelled, so `updated_at` is the approval time). "Requests this
  month" is `monthly_usage` against the plan limit; deleted requests still count (D19); from 80% of the allowance
  a prompt shows, with a link to Pro for Free owners.

## Not here

Notification emails (D15), the booking status page for visitors (Phase 11), charts (Phase 13).
