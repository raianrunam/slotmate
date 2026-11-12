# SlotMate — Project Requirements

Last updated: 2026-11-12 · Phase 3 (Define requirements) · Source: `docs/MASTER_PROMPT.md`

---

## 1. Introduction

### 1.1 What this document is for

This document turns the short feature list in the master prompt into precise rules, called **requirements**. Each requirement says one thing SlotMate must do, and lists checks that prove it works. Later, when we build a feature, we test it against these checks. A feature is only "done" when all of its checks pass.

### 1.2 How to read a requirement

```
### BOOK-03 — Approve a booking request      <- ID and short name
Statement: one sentence saying what must be true.
Source: where it comes from (master prompt section, and any decision from section 6).
Acceptance criteria: a checklist. Every box must be tickable by a test.
```

- The letters in an ID say which area it belongs to (`AUTH` = authentication, `BOOK` = booking management, and so on).
- The number is just a counter. IDs never change once written, so we can refer to them in commits, tests and the development log.
- **(Pro only)** next to a name means the feature is available only on the Pro plan.

### 1.3 Glossary

| Word | Meaning |
|---|---|
| **Owner** | A person with a SlotMate account. One owner account is one organization (decision D2). |
| **Visitor** | Anyone on the internet who opens a public booking page. Visitors have no account. |
| **Workspace** | A place or group the owner manages, for example "Science Building" or "Downtown Studio". |
| **Resource** | A bookable thing inside a workspace, for example a classroom, a meeting room or a camera. |
| **Slot** | One bookable block of time for a resource, for example 10:00–11:00. |
| **Booking request** | A visitor's request to use a resource in a slot. Also called a "booking". |
| **Status** | Where a booking request stands: `pending`, `approved`, `rejected` or `cancelled`. |
| **Plan** | The owner's subscription level: Free or Pro. |
| **Server** | The part of SlotMate that runs on our computers, not in the user's browser. Rules checked on the server cannot be bypassed by the user. |

### 1.4 Booking statuses

| Status | Meaning | Does it hold the slot? |
|---|---|---|
| `pending` | Submitted by a visitor, waiting for the owner. | Yes |
| `approved` | Accepted by the owner. | Yes |
| `rejected` | Refused by the owner. | No |
| `cancelled` | Was approved, then cancelled by the owner. | No |

Allowed changes: `pending → approved`, `pending → rejected`, `approved → cancelled`. No other changes are allowed.

---

## 2. User roles

### ROLE-01 — Organization owner
**Statement:** An owner is a logged-in user who manages only their own workspaces, resources, bookings, embed widget and subscription.
**Source:** Master prompt 2 · Decisions D1, D2
**Acceptance criteria:**
- [ ] After logging in, an owner can reach every dashboard feature in sections A–E and G–K.
- [ ] An owner never sees or changes data that belongs to another owner (see ISO-01).
- [ ] Each workspace has exactly one owner; there is no way to invite other people to it.

### ROLE-02 — Public visitor
**Statement:** A visitor is a person without an account who can view a public booking page and submit a booking request.
**Source:** Master prompt 2
**Acceptance criteria:**
- [ ] A visitor can open a public booking page and submit a request without registering or logging in.
- [ ] A visitor cannot open any dashboard page; they are sent to the login page instead.
- [ ] A visitor sees only the information needed to make a booking (see ISO-02).

---

## 3. Functional requirements

### A. Authentication (AUTH)

### AUTH-01 — Register
**Statement:** A new owner can create an account with an email address and a password.
**Source:** Master prompt 4.A · Decisions D3, D27
**Acceptance criteria:**
- [ ] Submitting a valid email and password creates an account and sends a confirmation email.
- [ ] The owner cannot use the dashboard until they click the link in the confirmation email.
- [ ] Registering with an email that already has an account does not create a second account.
- [ ] An invalid email or a password shorter than 8 characters shows a clear error and creates nothing.
- [ ] The 8-character minimum is enforced in the Supabase Auth settings, not only in the form.
- [ ] A new account starts on the Free plan.

### AUTH-02 — Log in
**Statement:** A registered owner can log in with their email and password.
**Source:** Master prompt 4.A
**Acceptance criteria:**
- [ ] Correct email and password take the owner to the dashboard.
- [ ] A wrong email or password shows one general error ("Invalid email or password") that does not reveal which part was wrong.
- [ ] An owner who has not confirmed their email is told to confirm it and is not logged in.

### AUTH-03 — Log out
**Statement:** A logged-in owner can log out.
**Source:** Master prompt 4.A
**Acceptance criteria:**
- [ ] Clicking "Log out" ends the session and shows the login page or home page.
- [ ] After logging out, opening a dashboard URL or pressing the browser's Back button does not show dashboard data.

### AUTH-04 — Protected dashboard
**Statement:** Only logged-in owners can open dashboard pages.
**Source:** Master prompt 4.A
**Acceptance criteria:**
- [ ] Opening any dashboard URL while logged out redirects to the login page.
- [ ] After logging in from that redirect, the owner lands in the dashboard.
- [ ] The check happens on the server, so it still works if JavaScript is turned off in the browser.

### AUTH-05 — Secure session handling
**Statement:** The owner's login session is stored and checked in a secure way.
**Source:** Master prompt 4.A
**Acceptance criteria:**
- [ ] The session is kept in secure cookies managed by Supabase Auth, not in places that page scripts can freely read.
- [ ] The session survives a page refresh, so the owner stays logged in.
- [ ] Every server action reads the session on the server and never trusts a user ID sent by the browser.
- [ ] An expired or invalid session is treated as logged out.

### AUTH-06 — Password recovery
**Statement:** An owner who forgot their password can set a new one using a link sent to their email.
**Source:** Master prompt 4.A
**Acceptance criteria:**
- [ ] Entering an email on the "Forgot password" page always shows the same message, whether or not the account exists.
- [ ] If the account exists, an email with a reset link is sent (by Supabase Auth).
- [ ] Opening the link lets the owner choose a new password; they can then log in with it, and the old password stops working.
- [ ] A used or expired link shows an error and does not change the password.

---

### B. Dashboard (DASH)

All numbers on the dashboard cover **all of the logged-in owner's workspaces** and nobody else's.

### DASH-01 — Total workspaces
**Statement:** The dashboard shows how many workspaces the owner has.
**Source:** Master prompt 4.B
**Acceptance criteria:**
- [ ] The number equals the count of the owner's workspaces.
- [ ] Creating or deleting a workspace changes the number the next time the dashboard loads.

### DASH-02 — Total resources
**Statement:** The dashboard shows how many resources the owner has across all workspaces.
**Source:** Master prompt 4.B
**Acceptance criteria:**
- [ ] The number equals the count of the owner's resources.
- [ ] Creating or deleting a resource changes the number the next time the dashboard loads.

### DASH-03 — Total bookings
**Statement:** The dashboard shows how many booking requests the owner has in total, whatever their status.
**Source:** Master prompt 4.B
**Acceptance criteria:**
- [ ] The number equals the count of the owner's existing booking requests in all statuses.
- [ ] A new owner with no bookings sees 0, not an error or a blank space.

### DASH-04 — Bookings by status
**Statement:** The dashboard shows separate counts of pending, approved and rejected bookings.
**Source:** Master prompt 4.B
**Acceptance criteria:**
- [ ] Three numbers are shown: pending, approved and rejected.
- [ ] Approving a pending request lowers "pending" by 1 and raises "approved" by 1.
- [ ] Rejecting a pending request lowers "pending" by 1 and raises "rejected" by 1.

### DASH-05 — Booking trends over time
**Statement:** The dashboard shows a chart of how many booking requests were received each day for the last 30 days.
**Source:** Master prompt 4.B
**Acceptance criteria:**
- [ ] A chart shows one point or bar per day for the last 30 days.
- [ ] Days with no bookings appear as 0, not as gaps.
- [ ] With no bookings at all, a friendly "no data yet" message is shown instead of an empty or broken chart.

### DASH-06 — Recent booking activity
**Statement:** The dashboard lists the owner's most recent booking requests.
**Source:** Master prompt 4.B · Decision D25
**Acceptance criteria:**
- [ ] The list shows the newest requests first, with visitor name, resource, date and time, and status.
- [ ] The list shows at most 5 items.
- [ ] Each item links to that booking's details (BOOK-02).

---

### C. Workspace management (WORK)

### WORK-01 — Create a workspace
**Statement:** An owner can create a workspace.
**Source:** Master prompt 4.C · Decision D12
**Acceptance criteria:**
- [ ] Submitting a name (required) and a description (optional) creates a workspace owned by the logged-in owner.
- [ ] A public link name ("slug") is made automatically from the workspace name and is unique across SlotMate.
- [ ] A missing name shows an error and creates nothing.
- [ ] Creation is refused when the owner has reached their plan's workspace limit (BILL-07).

### WORK-02 — Edit workspace information
**Statement:** An owner can change the name and description of their own workspace.
**Source:** Master prompt 4.C
**Acceptance criteria:**
- [ ] Saving a new name or description shows the updated values in the dashboard and on the public booking page.
- [ ] An empty name is refused with an error.
- [ ] An owner cannot edit another owner's workspace; the server refuses.

### WORK-03 — Delete a workspace
**Statement:** An owner can permanently delete their own workspace and everything inside it.
**Source:** Master prompt 4.C · Decision D13
**Acceptance criteria:**
- [ ] The owner must confirm in a dialog that clearly says the resources and bookings inside will also be deleted.
- [ ] After confirming, the workspace, its resources, their availability, their bookings and its embed settings are gone.
- [ ] The workspace's public booking page shows "not found".
- [ ] Cancelling the dialog deletes nothing.
- [ ] An owner cannot delete another owner's workspace; the server refuses.

### WORK-04 — Manage workspace settings
**Statement:** An owner can change their workspace's settings: its public link name (slug) and its time zone.
**Source:** Master prompt 4.C · Decisions D7, D12
**Acceptance criteria:**
- [ ] The owner can change the slug; the public booking page then works at the new address.
- [ ] A slug that is already used by another workspace, or that contains characters other than lowercase letters, numbers and hyphens, is refused with an error.
- [ ] The owner can pick a time zone from a list; a new workspace has a time zone set from the start.
- [ ] All times for the workspace (dashboard, public page, widget) are shown in the workspace's time zone, and the time zone is named on the public page.

---

### D. Resource management (RES)

### RES-01 — Create a resource
**Statement:** An owner can create a resource inside one of their workspaces.
**Source:** Master prompt 4.D
**Acceptance criteria:**
- [ ] Submitting the required fields creates a resource in the chosen workspace.
- [ ] Creation is refused when the owner has reached their plan's resource limit (BILL-07).
- [ ] An owner cannot create a resource in another owner's workspace; the server refuses.

### RES-02 — Edit a resource
**Statement:** An owner can change the details of their own resource.
**Source:** Master prompt 4.D
**Acceptance criteria:**
- [ ] Saved changes appear in the dashboard and on the public booking page.
- [ ] Invalid values (see RES-04 to RES-08) are refused with an error and nothing is saved.
- [ ] An owner cannot edit another owner's resource; the server refuses.

### RES-03 — Delete a resource
**Statement:** An owner can permanently delete their own resource and its bookings.
**Source:** Master prompt 4.D · Decision D13
**Acceptance criteria:**
- [ ] The owner must confirm in a dialog that says the resource's bookings will also be deleted.
- [ ] After confirming, the resource, its availability, its bookings and its image are gone, and it no longer appears on the public page.
- [ ] An owner cannot delete another owner's resource; the server refuses.

### RES-04 — Resource name and description
**Statement:** Every resource has a name and may have a description.
**Source:** Master prompt 4.D
**Acceptance criteria:**
- [ ] A resource cannot be saved without a name.
- [ ] The description is optional.
- [ ] The name and description are shown on the public booking page.

### RES-05 — Resource image
**Statement:** An owner can upload one optional image for a resource.
**Source:** Master prompt 4.D · Decision D9
**Acceptance criteria:**
- [ ] A JPG, PNG or WebP file of 2 MB or less can be uploaded and is then shown in the dashboard and on the public page.
- [ ] Any other file type, or a file larger than 2 MB, is refused with a clear error. This is checked on the server too.
- [ ] The owner can replace or remove the image.
- [ ] A resource without an image shows a neutral placeholder.

### RES-06 — Resource availability switch
**Statement:** An owner can mark a resource as available or unavailable for booking.
**Source:** Master prompt 4.D
**Acceptance criteria:**
- [ ] A resource marked unavailable does not appear on the public booking page and cannot be booked, even by sending a request directly to the server.
- [ ] Marking it available again makes it bookable, following its schedule (AVAIL-01, AVAIL-02).
- [ ] Changing the switch does not change existing bookings.

### RES-07 — Booking duration
**Statement:** Each resource has one fixed slot length, set by the owner in minutes.
**Source:** Master prompt 4.D · Decision D5
**Acceptance criteria:**
- [ ] The owner must choose a slot length when creating a resource (for example 30, 60 or 120 minutes).
- [ ] Zero, negative or non-number values are refused.
- [ ] The public page offers slots of exactly this length (AVAIL-03).

### RES-08 — Booking capacity
**Statement:** Each resource has a capacity, which is the largest number of people allowed in one booking.
**Source:** Master prompt 4.D · Decision D4
**Acceptance criteria:**
- [ ] The owner must enter a whole number of 1 or more.
- [ ] The capacity is shown on the public booking page.
- [ ] A booking request with more attendees than the capacity is refused by the server.

---

### E. Availability management (AVAIL)

Availability is set **per resource** (decision D6).

### AVAIL-01 — Available weekdays
**Statement:** An owner can choose on which days of the week a resource can be booked.
**Source:** Master prompt 4.E · Decision D6
**Acceptance criteria:**
- [ ] The owner can switch each weekday (Monday to Sunday) on or off for a resource.
- [ ] Dates that fall on a switched-off weekday offer no slots on the public page.
- [ ] A booking request for a switched-off weekday is refused by the server.

### AVAIL-02 — Operating hours
**Statement:** An owner can set the opening and closing time of a resource for each available weekday.
**Source:** Master prompt 4.E · Decisions D6, D7
**Acceptance criteria:**
- [ ] The owner can set an opening time and a closing time for each switched-on weekday.
- [ ] A closing time that is not later than the opening time is refused.
- [ ] No slot starts before the opening time or ends after the closing time.
- [ ] Times are understood in the workspace's time zone.

### AVAIL-03 — Slots from booking duration
**Statement:** The bookable slots of a day are made by dividing the operating hours into blocks of the resource's slot length.
**Source:** Master prompt 4.E · Decisions D5, D8
**Acceptance criteria:**
- [ ] Example: open 09:00–12:00 with 60-minute slots gives 09:00, 10:00 and 11:00.
- [ ] A leftover part shorter than one slot is not offered (09:00–12:30 with 60-minute slots still gives three slots).
- [ ] Slots that have already started or passed are not offered.
- [ ] Slots more than 90 days ahead are not offered.

### AVAIL-04 — No overlapping reservations
**Statement:** A resource can never have two bookings that hold the same slot.
**Source:** Master prompt 4.E, 5 · Decision D10
**Acceptance criteria:**
- [ ] A slot that has a pending or approved booking is shown as unavailable on the public page.
- [ ] A second request for that slot is refused with a "this time was just taken" message.
- [ ] When a booking is rejected, cancelled or deleted, its slot becomes available again.
- [ ] The database itself also blocks a second pending/approved booking for the same resource and time, as a safety net (see PERF-03).

### AVAIL-05 — Availability checked on the server
**Statement:** Every booking request is checked against all availability rules on the server before it is saved.
**Source:** Master prompt 4.E
**Acceptance criteria:**
- [ ] A request sent straight to the server (skipping the web page) is refused if the resource is unavailable, the weekday is off, the time is outside operating hours, the time does not match a real slot, the slot is in the past or over 90 days ahead, or the slot is taken.
- [ ] Each refusal returns a clear reason, and nothing is saved.

---

### F. Public booking page (PUB)

### PUB-01 — Unique public URL per workspace
**Statement:** Every workspace has its own public web address of the form `/book/<workspace-slug>`.
**Source:** Master prompt 4.F · Decision D12
**Acceptance criteria:**
- [ ] The page opens without logging in.
- [ ] No two workspaces share the same address.
- [ ] An address with an unknown slug shows a "not found" page.
- [ ] The owner can see and copy the address from the dashboard.

### PUB-02 — View available resources
**Statement:** The public page lists the workspace's resources that can be booked.
**Source:** Master prompt 4.F
**Acceptance criteria:**
- [ ] Every resource of the workspace that is marked available is listed.
- [ ] Unavailable resources, and resources of other workspaces, are not listed.
- [ ] If there are no bookable resources, a friendly message is shown.

### PUB-03 — Show descriptions and availability
**Statement:** For each resource, the public page shows its details and which slots are free.
**Source:** Master prompt 4.F
**Acceptance criteria:**
- [ ] The name, description, image (or placeholder), capacity and slot length are shown.
- [ ] After a date is chosen, the free slots for that date are shown, and taken slots cannot be picked.
- [ ] No information about who booked the taken slots is shown.

### PUB-04 — Collect visitor details
**Statement:** The booking form collects the visitor's name, email, number of attendees, and optionally a phone number and a note.
**Source:** Master prompt 4.F · Decisions D4, D11
**Acceptance criteria:**
- [ ] Name, email and number of attendees are required; phone and note are optional.
- [ ] A missing name, a badly formed email, or an attendee number below 1 or above the capacity shows an error next to the field.
- [ ] The same checks are repeated on the server.

### PUB-05 — Choose date and time
**Statement:** A visitor can choose a date and one free slot for a resource.
**Source:** Master prompt 4.F · Decisions D5, D8
**Acceptance criteria:**
- [ ] The date picker allows only today up to 90 days ahead.
- [ ] Only free slots can be selected, and exactly one slot per request.
- [ ] Times are shown in the workspace's time zone.

### PUB-06 — Submit without registration
**Statement:** A visitor can submit a booking request without creating an account.
**Source:** Master prompt 4.F
**Acceptance criteria:**
- [ ] A valid submission creates a booking request with status `pending` and holds the slot.
- [ ] The visitor is never asked to register or log in.
- [ ] If the slot was taken while the visitor was filling in the form, they see a clear message and can pick another slot.
- [ ] If the owner's monthly booking limit is reached, the page says it is not accepting requests right now and nothing is saved (BILL-07).

### PUB-07 — Confirmation page
**Statement:** After a successful submission, the visitor sees a confirmation page.
**Source:** Master prompt 4.F · Decision D15
**Acceptance criteria:**
- [ ] The page shows the resource, date, time, the visitor's name and the status "pending".
- [ ] The page shows a private status link that the visitor can save to check the booking later (NOTIF-03).
- [ ] Refreshing the page does not create a second booking.

---

### G. Booking management (BOOK)

### BOOK-01 — Display all booking requests
**Statement:** An owner can see a list of all booking requests for their workspaces.
**Source:** Master prompt 4.G · Decision D21
**Acceptance criteria:**
- [ ] The list shows visitor name, resource, workspace, date and time, and status, newest first.
- [ ] The list shows 20 requests per page, with a way to move between pages.
- [ ] Only the logged-in owner's requests appear.
- [ ] With no requests, a friendly empty message is shown.

### BOOK-02 — View booking details
**Statement:** An owner can open one booking request and see all its details.
**Source:** Master prompt 4.G
**Acceptance criteria:**
- [ ] The details show the visitor's name, email, phone, note and number of attendees, plus the resource, date, time, status and when it was submitted.
- [ ] Opening the details address of another owner's booking shows "not found".

### BOOK-03 — Approve a booking request
**Statement:** An owner can approve a pending booking request.
**Source:** Master prompt 4.G
**Acceptance criteria:**
- [ ] Approving a pending request changes its status to `approved`.
- [ ] Only pending requests can be approved; the server refuses anything else.
- [ ] An owner cannot approve another owner's request; the server refuses.

### BOOK-04 — Reject a booking request
**Statement:** An owner can reject a pending booking request.
**Source:** Master prompt 4.G · Decision D10
**Acceptance criteria:**
- [ ] Rejecting a pending request changes its status to `rejected`.
- [ ] The slot becomes available again on the public page.
- [ ] Only pending requests can be rejected; the server refuses anything else.

### BOOK-05 — Cancel an approved booking
**Statement:** An owner can cancel a booking that was approved.
**Source:** Master prompt 4.G · Decision D10
**Acceptance criteria:**
- [ ] Cancelling an approved booking changes its status to `cancelled`, after a confirmation dialog.
- [ ] The slot becomes available again on the public page.
- [ ] Only approved bookings can be cancelled; the server refuses anything else.

### BOOK-06 — Delete a booking request
**Statement:** An owner can permanently delete a booking request in any status.
**Source:** Master prompt 4.G · Decisions D13, D19
**Acceptance criteria:**
- [ ] The owner must confirm in a dialog before the request is deleted.
- [ ] After deletion, the request is gone from lists and counts, and its slot (if it held one) is available again.
- [ ] Deleting a request does **not** give back any of the month's booking-request allowance (BILL-07).
- [ ] An owner cannot delete another owner's request; the server refuses.

### BOOK-07 — Filter by status
**Statement:** An owner can filter the booking list by status.
**Source:** Master prompt 4.G
**Acceptance criteria:**
- [ ] The owner can choose All, Pending, Approved, Rejected or Cancelled.
- [ ] Only requests with the chosen status are shown.
- [ ] The filter works together with search (BOOK-08) and paging.

### BOOK-08 — Search by visitor or resource
**Statement:** An owner can search the booking list by visitor or resource.
**Source:** Master prompt 4.G
**Acceptance criteria:**
- [ ] Typing text shows only requests whose visitor name, visitor email or resource name contains that text, ignoring upper and lower case.
- [ ] A search with no matches shows a "no results" message.
- [ ] Clearing the search shows the full list again.

---

### H. Notifications (NOTIF)

Notifications are **in-app only** in version 1; SlotMate does not send notification emails (decision D15). The only emails are the account emails sent by Supabase Auth (AUTH-01, AUTH-06).

### NOTIF-01 — Booking confirmation message
**Statement:** A visitor sees a clear message that their booking request was received.
**Source:** Master prompt 4.H · Decision D15
**Acceptance criteria:**
- [ ] After a successful submission, a success message appears on the confirmation page (PUB-07).
- [ ] After a failed submission, an error message explains what went wrong, and no success message appears.

### NOTIF-02 — Notify owner about new booking requests
**Statement:** An owner is shown, inside the dashboard, that new booking requests are waiting.
**Source:** Master prompt 4.H · Decision D15
**Acceptance criteria:**
- [ ] The dashboard navigation shows a badge with the number of pending requests.
- [ ] A new request raises the badge number the next time a dashboard page loads.
- [ ] Approving, rejecting or deleting a pending request lowers the badge number.
- [ ] The badge counts only the logged-in owner's requests.

### NOTIF-03 — Booking status updates
**Statement:** A visitor can check the current status of their booking request at any time using a private status link.
**Source:** Master prompt 4.H · Decision D15
**Acceptance criteria:**
- [ ] The status link opens a page showing the resource, date, time and current status, without logging in.
- [ ] After the owner approves, rejects or cancels the booking, the page shows the new status.
- [ ] The link contains a long random code that cannot be guessed; a wrong code shows "not found".
- [ ] If the booking was deleted, the page shows "not found".
- [ ] The owner sees a short success message after each approve, reject, cancel or delete action.

---

### I. Analytics (ANLT)

"Basic analytics" (Free) is ANLT-01, ANLT-02 and ANLT-05. "Advanced analytics" (Pro) adds ANLT-03, ANLT-04 and ANLT-06 (decision D16). All analytics cover only the logged-in owner's data.

### ANLT-01 — Booking statistics
**Statement:** The analytics page shows the owner's total bookings and the count in each status.
**Source:** Master prompt 4.I · Decision D16
**Acceptance criteria:**
- [ ] Totals for all bookings, pending, approved, rejected and cancelled are shown.
- [ ] The numbers match the booking list (BOOK-01) for the same period.

### ANLT-02 — Daily booking chart
**Statement:** The analytics page shows a chart of booking requests per day.
**Source:** Master prompt 4.I · Decision D16
**Acceptance criteria:**
- [ ] On the Free plan the chart covers the last 30 days.
- [ ] Days with no bookings show as 0.
- [ ] With no data, a "no data yet" message is shown.

### ANLT-03 — Monthly booking chart (Pro only)
**Statement:** A Pro owner sees a chart of booking requests per month.
**Source:** Master prompt 4.I · Decision D16
**Acceptance criteria:**
- [ ] A Pro owner sees one bar or point per month.
- [ ] A Free owner sees a locked area with an upgrade prompt instead.
- [ ] The server does not send this data to a Free owner.

### ANLT-04 — Resource usage (Pro only)
**Statement:** A Pro owner sees how many bookings each resource received.
**Source:** Master prompt 4.I · Decision D16
**Acceptance criteria:**
- [ ] A chart or table lists each resource with its number of bookings, most used first.
- [ ] A Free owner sees a locked area with an upgrade prompt, and the server does not send this data.

### ANLT-05 — Booking status distribution
**Statement:** The analytics page shows a chart of how bookings are split between statuses.
**Source:** Master prompt 4.I · Decision D16
**Acceptance criteria:**
- [ ] A chart shows the share of pending, approved, rejected and cancelled bookings.
- [ ] The shares match the numbers in ANLT-01.

### ANLT-06 — Date filters (Pro only)
**Statement:** A Pro owner can choose a start date and an end date, and all analytics update to that period.
**Source:** Master prompt 4.I · Decision D16
**Acceptance criteria:**
- [ ] Choosing a date range updates the statistics and every chart to that range.
- [ ] An end date before the start date is refused.
- [ ] A Free owner cannot change the period; it stays at the last 30 days.

---

### J. Embed widget (EMBED)

"Basic embed widget" (Free) is EMBED-01, 02, 04, 06 and 07. "Customizable embed widget" (Pro) adds EMBED-03 and EMBED-05 (decision D17).

### EMBED-01 — Generate an embeddable widget
**Statement:** An owner can generate a booking widget for a workspace that can be placed on another website.
**Source:** Master prompt 4.J
**Acceptance criteria:**
- [ ] The owner can open a widget page for each of their workspaces.
- [ ] The widget lets a visitor do everything the public booking page allows (PUB-02 to PUB-07).
- [ ] Bookings made through the widget follow exactly the same rules and limits as the public page.

### EMBED-02 — Iframe embed
**Statement:** The widget is embedded on other websites using an iframe (a small window that shows one web page inside another).
**Source:** Master prompt 4.J · Decision D18
**Acceptance criteria:**
- [ ] Pasting the embed code into a plain HTML page shows a working widget.
- [ ] The widget pages can be shown inside an iframe on other websites, but dashboard pages cannot.
- [ ] No JavaScript embed is offered in version 1.

### EMBED-03 — Display layouts (Pro only)
**Statement:** A Pro owner can choose between different widget layouts.
**Source:** Master prompt 4.J · Decisions D17, D26
**Acceptance criteria:**
- [ ] A Pro owner can pick between two layouts, "list" (resources one under another) and "grid" (resources as cards side by side), and the widget changes to match.
- [ ] A Free owner's widget always uses the default layout, and the layout choice is shown as locked.

### EMBED-04 — Light and dark themes
**Statement:** An owner can choose a light or dark theme for the widget.
**Source:** Master prompt 4.J · Decision D17
**Acceptance criteria:**
- [ ] Both Free and Pro owners can choose light or dark.
- [ ] Text stays easy to read in both themes.

### EMBED-05 — Background customization (Pro only)
**Statement:** A Pro owner can choose the widget's background colour.
**Source:** Master prompt 4.J · Decision D17
**Acceptance criteria:**
- [ ] A Pro owner can pick a background colour, and the widget uses it.
- [ ] A Free owner's widget uses the theme's default background, and the option is shown as locked.
- [ ] The server ignores a custom background sent by a Free owner.

### EMBED-06 — Live preview
**Statement:** The widget page shows a preview that updates as the owner changes the options.
**Source:** Master prompt 4.J
**Acceptance criteria:**
- [ ] Changing the theme, layout or background updates the preview without reloading the page.
- [ ] The preview looks the same as the real embedded widget.

### EMBED-07 — Copyable embed code
**Statement:** The widget page shows the embed code and a button to copy it.
**Source:** Master prompt 4.J
**Acceptance criteria:**
- [ ] The code shown matches the chosen options.
- [ ] Clicking "Copy" puts the code on the clipboard and shows a "Copied" message.

---

### K. Subscription and billing (BILL)

Plan limits apply to the **owner account as a whole**, across all of its workspaces (decision D2).

| | Free | Pro |
|---|---|---|
| Price | $0 | $9.99/month |
| Workspaces | 1 | 5 |
| Resources | 3 | 25 |
| Booking requests per month | 100 | 1,000 |
| Analytics | Basic | Advanced |
| Embed widget | Basic | Customizable |

### BILL-01 — Free plan
**Statement:** The Free plan allows 1 workspace, 3 resources, 100 booking requests per month, basic analytics and the basic embed widget.
**Source:** Master prompt 4.K · Decisions D2, D16, D17
**Acceptance criteria:**
- [ ] A Free owner can have 1 workspace and 3 resources in total, and cannot create more.
- [ ] A Free owner can receive 100 booking requests in a calendar month; the 101st is refused.
- [ ] A Free owner has ANLT-01, 02, 05 and EMBED-01, 02, 04, 06, 07, and the Pro-only features are locked.

### BILL-02 — Pro plan
**Statement:** The Pro plan costs $9.99 per month and allows 5 workspaces, 25 resources, 1,000 booking requests per month, advanced analytics and the customizable embed widget.
**Source:** Master prompt 4.K · Decisions D2, D16, D17
**Acceptance criteria:**
- [ ] A Pro owner can have 5 workspaces and 25 resources in total, and cannot create more.
- [ ] A Pro owner can receive 1,000 booking requests in a calendar month; the 1,001st is refused.
- [ ] A Pro owner has every ANLT and EMBED feature.
- [ ] The price shown and charged is $9.99 per month.

### BILL-03 — Subscription page
**Statement:** An owner can open a subscription page that shows their plan, their usage and both plans side by side.
**Source:** Master prompt 4.K
**Acceptance criteria:**
- [ ] The page shows the current plan (Free or Pro).
- [ ] The page shows current usage against the limits: workspaces, resources and booking requests this month.
- [ ] The page compares Free and Pro using the exact limits in the table above.
- [ ] A Free owner sees an Upgrade button; a Pro owner sees a way to cancel.

### BILL-04 — Stripe Checkout
**Statement:** An owner pays for Pro on Stripe's secure checkout page.
**Source:** Master prompt 4.K
**Acceptance criteria:**
- [ ] Clicking Upgrade sends the owner to a Stripe Checkout page for the Pro plan at $9.99 per month.
- [ ] SlotMate never sees or stores card numbers.
- [ ] Leaving Checkout without paying returns the owner to SlotMate, still on Free.
- [ ] During development only Stripe test mode and test cards are used.

### BILL-05 — Stripe webhook integration
**Statement:** SlotMate updates an owner's subscription when Stripe sends it a message (a "webhook") about a payment or subscription change.
**Source:** Master prompt 4.K, 10
**Acceptance criteria:**
- [ ] A successful checkout message makes the correct owner Pro.
- [ ] Messages about a subscription being changed or ended update the owner's plan to match.
- [ ] A message without a valid Stripe signature is refused and changes nothing (SEC-04).
- [ ] Receiving the same message twice does not cause errors or duplicate records.
- [ ] The plan changes only because of a verified webhook, never just because the browser returned from Checkout.

### BILL-06 — Subscription status management
**Statement:** SlotMate keeps a record of each owner's plan and subscription state, and uses it to decide what the owner may do.
**Source:** Master prompt 4.K
**Acceptance criteria:**
- [ ] Each owner has exactly one subscription record with the plan, the state (for example active, or set to cancel) and the end date of the paid period.
- [ ] The subscription page and all limits use this record.
- [ ] An owner can only read their own subscription record and cannot change it directly.

### BILL-07 — Usage restrictions
**Statement:** The server enforces the plan limits for workspaces, resources and monthly booking requests.
**Source:** Master prompt 4.K, 10 · Decisions D2, D19
**Acceptance criteria:**
- [ ] Creating a workspace or resource beyond the plan limit is refused by the server with a message that suggests upgrading, even if the request skips the web page.
- [ ] Every submitted booking request counts toward the month's total, whatever happens to it later, including deletion.
- [ ] The count covers all of the owner's workspaces and starts again at 0 on the 1st of each calendar month (UTC).
- [ ] When the monthly limit is reached, the public page and the widget say they are not accepting requests right now, and no request is saved.
- [ ] When the monthly limit is reached, the owner sees an upgrade prompt in the dashboard.

### BILL-08 — Upgrade
**Statement:** A Free owner can upgrade to Pro.
**Source:** Master prompt 4.K
**Acceptance criteria:**
- [ ] After a successful test payment and its webhook, the subscription page shows Pro.
- [ ] The Pro limits and Pro-only features work straight away, without logging out and in.
- [ ] An owner who is already Pro cannot start a second subscription.

### BILL-09 — Cancel and downgrade
**Statement:** A Pro owner can cancel, keeps Pro until the end of the paid month, and then returns to Free without losing data.
**Source:** Master prompt 4.K · Decisions D20, D23
**Acceptance criteria:**
- [ ] A Pro owner can click "Manage subscription" on the subscription page, which opens Stripe's Customer Portal, and cancel there.
- [ ] After cancelling, the owner stays Pro until the end of the paid period, and the page shows that end date.
- [ ] When the period ends (confirmed by a webhook), the owner is on Free and the Free limits apply.
- [ ] Nothing is deleted on downgrade.
- [ ] If the owner then has more than 1 workspace or 3 resources, they must choose which 1 workspace and up to 3 resources stay active.
- [ ] Until the owner chooses, all affected workspaces and resources are read-only, hidden from the public and cannot receive bookings. Nothing is deleted.
- [ ] The workspaces and resources not chosen are hidden from the public, cannot receive bookings, and are read-only in the dashboard until the owner upgrades again or deletes items to get within the limits.

---

## 4. Non-functional requirements

These describe **how well** SlotMate must work, not what it does.

### Security (SEC)

### SEC-01 — No secrets in code or GitHub
**Statement:** Passwords, API keys and other secrets are never written in source code or committed to Git.
**Source:** Master prompt 1 (rule 13)
**Acceptance criteria:**
- [ ] Secrets are kept in environment variables; the local `.env` files are ignored by Git.
- [ ] The repository contains an example file listing the variable names with no real values.
- [ ] Secret keys (Supabase service key, Stripe secret key, Stripe webhook secret) are never sent to the browser.
- [ ] A search of the repository and its history finds no real keys.

### SEC-02 — Server-side input validation
**Statement:** Everything a user sends is checked on the server before it is used or saved.
**Source:** Master prompt 4.E, 10
**Acceptance criteria:**
- [ ] Every form has server checks that are at least as strict as the checks in the browser.
- [ ] Invalid input sent directly to the server is refused with a clear error, and nothing is saved.
- [ ] Text typed by users is shown as plain text and can never run as code in someone's browser.

### SEC-03 — Authorization on every owner action
**Statement:** Every action that reads or changes an owner's data first checks, on the server, who is logged in and that the data is theirs.
**Source:** Master prompt 10
**Acceptance criteria:**
- [ ] Every dashboard action fails when logged out.
- [ ] Every dashboard action fails when it targets another owner's workspace, resource, booking, widget or subscription.

### SEC-04 — Stripe webhook verification
**Statement:** SlotMate only trusts webhook messages that carry a valid Stripe signature.
**Source:** Master prompt 10
**Acceptance criteria:**
- [ ] A message with a missing or wrong signature gets an error response and changes no data.
- [ ] A correctly signed test message from Stripe is accepted.

### SEC-05 — Safe sessions
**Statement:** Login sessions are protected from theft and misuse.
**Source:** Master prompt 4.A, 10
**Acceptance criteria:**
- [ ] Session cookies are sent only over HTTPS in production.
- [ ] Passwords are handled only by Supabase Auth and are never stored or logged by SlotMate.
- [ ] Logging out makes the session unusable.

### SEC-06 — Rate limit on the public booking form
**Statement:** The server limits how many booking requests one visitor can send to one workspace in a short time. The limit is counted per visitor per workspace, not across all of SlotMate, because many visitors can share one internet address (for example university Wi-Fi).
**Source:** Decisions D14, D24
**Acceptance criteria:**
- [ ] After 5 requests in 10 minutes from the same visitor (identified by internet address) to the same workspace, further requests to that workspace are refused with a "please try again later" message.
- [ ] Requests to one workspace do not count toward the same visitor's limit for any other workspace.
- [ ] Refused requests are not saved and do not count toward the owner's monthly limit.
- [ ] The limit is applied on the server and cannot be skipped from the browser.
- [ ] The limit is built with the existing stack (e.g. a Supabase table). No new service is added without the project owner's approval.

### Data isolation (ISO)

### ISO-01 — Owners see only their own data
**Statement:** One organization can never read or change another organization's private data.
**Source:** Master prompt 5, 10
**Acceptance criteria:**
- [ ] Row Level Security (database rules that decide who may see each row) is switched on for every table.
- [ ] With two test owners A and B: A cannot list, open, edit or delete B's workspaces, resources, availability, bookings, embed settings or subscription, either through the app or by asking the database directly with A's login.
- [ ] Guessing or changing an ID in a web address never shows another owner's data.

### ISO-02 — Visitors see only what booking needs
**Statement:** A visitor can read only the information needed to make a booking.
**Source:** Master prompt 5
**Acceptance criteria:**
- [ ] Without logging in, a visitor can read only: the workspace's name, description and time zone; its available resources' name, description, image, capacity and slot length; and which slots are free or taken.
- [ ] A visitor cannot read the owner's email, plan or billing details, or anything about unavailable resources.
- [ ] A visitor can create a booking request but cannot edit or delete any booking.

### ISO-03 — Visitor details stay private
**Statement:** A visitor's personal details are visible only to the owner of the workspace they booked.
**Source:** Master prompt 5
**Acceptance criteria:**
- [ ] The public page and widget show taken slots only as "unavailable", with no names, emails, phone numbers or notes.
- [ ] The private status page (NOTIF-03) does not show the visitor's email, phone or note.
- [ ] Visitor details appear only in the owner's dashboard.

### Performance (PERF)

### PERF-01 — Page load time
**Statement:** The main pages show their content within about 3 seconds on a normal connection.
**Source:** Decision D21
**Acceptance criteria:**
- [ ] On the deployed site, the home page, login page, dashboard, booking list and a public booking page each show their main content within 3 seconds on a normal broadband connection.
- [ ] While data is loading, the page shows a loading indicator, not a blank screen.

### PERF-02 — Lists stay fast as data grows
**Statement:** Long lists are loaded one page at a time.
**Source:** Decision D21
**Acceptance criteria:**
- [ ] The booking list loads 20 items per page and never loads all bookings at once.
- [ ] With 1,000 test bookings, the booking list still meets PERF-01.

### PERF-03 — Double-booking prevention under load
**Statement:** If two visitors submit a request for the same slot at the same moment, exactly one succeeds.
**Source:** Master prompt 5, 10
**Acceptance criteria:**
- [ ] A test that sends two requests for the same resource and slot at the same time ends with exactly one saved booking and one clear refusal.
- [ ] The protection is in the database (a rule or a transaction), not only in the application code.

### Responsive design (RESP)

### RESP-01 — Works on phone, tablet and desktop
**Statement:** Every page is usable at phone, tablet and desktop screen widths.
**Source:** Master prompt 10 · Decision D22
**Acceptance criteria:**
- [ ] At 375 px, 768 px and 1280 px wide, every page shows all its content without sideways scrolling.
- [ ] Menus, buttons, forms, tables and charts can be read and used at all three widths.

### RESP-02 — Public booking and widget work fully on a phone
**Statement:** A visitor can complete a whole booking on a phone, on the public page and in the widget.
**Source:** Master prompt 10 · Decision D22
**Acceptance criteria:**
- [ ] At 375 px wide, a visitor can pick a resource, date and slot, fill in the form, submit, and read the confirmation page.
- [ ] Buttons and slots are large enough to tap easily.
- [ ] The widget adjusts to the width of the space it is given on the host website.

---

## 5. Out of scope

These are **not** part of this project, because the master prompt does not ask for them. If one becomes important, it must first be approved and added to this document.

- Visitor accounts or visitor login.
- Visitors changing or cancelling their own bookings.
- Taking payment from visitors for bookings.
- Team members, staff accounts, or inviting other people to a workspace (decision D1).
- Notification emails or text messages for bookings (decision D15). Account emails from Supabase Auth are in scope.
- A JavaScript embed for the widget (decision D18).
- CAPTCHA on the public form (decision D14).
- Recurring bookings, waiting lists, and booking several slots in one request.
- More than one booking sharing the same slot (decision D4).
- Holidays, special closing dates, or different hours for particular dates.
- A setting for how far ahead visitors can book (it is fixed at 90 days, decision D8).
- Calendar sync (Google, Outlook) and exporting data.
- Trash, undo, or recovering deleted items (decision D13).
- Native mobile apps and multiple languages.
- Plans other than Free and Pro, yearly billing, free trials, coupons and refunds handling.
- Real payments: Stripe is used in test mode only.

---

## 6. Decisions

These answers were approved by the project owner on 2026-11-12. Requirements refer to them as D1–D27.

| # | Question | Decision |
|---|---|---|
| D1 | Can several people manage one workspace? | No. One owner per workspace; team invites are out of scope. |
| D2 | What is an "organization"? | One owner account is one organization. Plan limits count across the whole account. |
| D3 | Must owners confirm their email on sign-up? | Yes. |
| D4 | What does "booking capacity" mean? | The largest number of people in one booking. Only one booking per slot. |
| D5 | Fixed or free booking duration? | A fixed slot length per resource. A visitor books one slot. |
| D6 | Where is availability set? | Per resource (weekdays and opening hours). |
| D7 | Which time zone is used? | Each workspace has one time zone; all its times are shown in it. |
| D8 | How far ahead can visitors book? | Past times are blocked; up to 90 days ahead, fixed. |
| D9 | How do resource images work? | One optional upload per resource in Supabase Storage; JPG, PNG or WebP; 2 MB at most. |
| D10 | Does a pending request hold the slot? | Yes. Pending and approved hold the slot; rejected and cancelled free it. |
| D11 | Which visitor details are collected? | Name, email and number of attendees (required); phone and note (optional). |
| D12 | What does the public URL look like? | `/book/<workspace-slug>`; the slug comes from the name, is unique, and can be edited in settings. |
| D13 | How do deletes work? | Permanent, after a confirmation dialog, and they remove everything underneath. |
| D14 | Spam protection on the public form? | A simple server-side rate limit; no CAPTCHA. |
| D15 | How are notifications delivered? | In-app only: a dashboard badge and list for owners, a private status link for visitors. No notification emails in version 1. |
| D16 | Basic vs advanced analytics? | Basic (Free): totals, status distribution, daily chart for the last 30 days. Advanced (Pro): adds the monthly chart, resource usage and date filters. |
| D17 | Basic vs customizable widget? | Basic (Free): default layout, light/dark theme, live preview, copyable code. Customizable (Pro): adds layout choice and background customization. |
| D18 | Iframe or JavaScript embed? | Iframe only. |
| D19 | How does the monthly booking limit work? | Every submitted request counts, even if later deleted; counted across the account; resets on the 1st of each month (UTC); when reached, the public page stops accepting requests and the owner sees an upgrade prompt. |
| D20 | What happens when Pro is cancelled over the Free limits? | Pro lasts until the end of the paid month. Nothing is deleted. The owner chooses 1 workspace and 3 resources to stay active; the rest are hidden and read-only. |
| D21 | Performance targets? | Main content within about 3 seconds; lists show 20 items per page. |
| D22 | Which screen sizes are tested? | 375 px (phone), 768 px (tablet) and 1280 px (desktop). |
| D23 | How does an owner cancel Pro? | On Stripe's ready-made Customer Portal page, opened from the subscription page. |
| D24 | What is the exact rate limit on the public form? | At most 5 booking requests per 10 minutes from the same visitor (identified by internet address) to the same workspace. The limit is counted per visitor per workspace, not across all of SlotMate, because many visitors can share one internet address (for example university Wi-Fi). Must be built with the existing stack (e.g. a Supabase table). No new services without the project owner's approval. |
| D25 | How many items does "Recent booking activity" show? | 5. |
| D26 | Which widget layouts does Pro offer? | Two: "list" and "grid". |
| D27 | What is the minimum password length? | 8 characters. Must be enforced in the Supabase Auth settings, not only in the form. |

---

## 7. Open questions

There are no open questions at the moment. All 27 questions raised so far have been decided and are recorded in section 6.

If a new question comes up during later phases, it is added here with a recommendation and a reason, and it is not acted on until the project owner approves it.

---

## 8. Traceability table

This table maps every bullet in section 4 of the master prompt to the requirement that covers it. It proves that nothing was left out and nothing was invented.

| Master prompt bullet | Requirement |
|---|---|
| **A. Authentication** | |
| User registration | AUTH-01 |
| Login and logout | AUTH-02, AUTH-03 |
| Protected dashboard | AUTH-04 |
| Secure session handling | AUTH-05, SEC-05 |
| Password recovery | AUTH-06 |
| **B. Dashboard** | |
| Total workspaces | DASH-01 |
| Total resources | DASH-02 |
| Total bookings | DASH-03 |
| Pending bookings | DASH-04 |
| Approved bookings | DASH-04 |
| Rejected bookings | DASH-04 |
| Booking trends over time | DASH-05 |
| Recent booking activity | DASH-06 |
| **C. Workspace Management** | |
| Create workspaces | WORK-01 |
| Edit workspace information | WORK-02 |
| Delete workspaces | WORK-03 |
| Manage workspace settings | WORK-04 |
| **D. Resource Management** | |
| Create resources | RES-01 |
| Edit and delete resources | RES-02, RES-03 |
| Resource name and description | RES-04 |
| Resource image | RES-05 |
| Resource availability | RES-06 |
| Booking duration | RES-07 |
| Booking capacity | RES-08 |
| **E. Availability Management** | |
| Configure available weekdays | AVAIL-01 |
| Configure operating hours | AVAIL-02 |
| Set booking duration | RES-07, AVAIL-03 |
| Prevent overlapping reservations | AVAIL-04, PERF-03 |
| Validate booking availability on the server | AVAIL-05 |
| **F. Public Booking Page** | |
| Generate a unique public URL for each workspace | PUB-01 |
| Allow visitors to view available resources | PUB-02 |
| Display descriptions and availability | PUB-03 |
| Collect visitor name, email and other necessary details | PUB-04 |
| Allow visitors to choose dates and times | PUB-05 |
| Submit booking requests without registration | PUB-06 |
| Show a confirmation page after submission | PUB-07 |
| **G. Booking Management** | |
| Display all booking requests | BOOK-01 |
| View booking details | BOOK-02 |
| Approve requests | BOOK-03 |
| Reject requests | BOOK-04 |
| Cancel approved bookings | BOOK-05 |
| Delete requests | BOOK-06 |
| Filter by booking status | BOOK-07 |
| Search by visitor or resource | BOOK-08 |
| **H. Notifications** | |
| Display booking confirmation messages | NOTIF-01 |
| Notify organization owners about new booking requests | NOTIF-02 |
| Provide booking status updates | NOTIF-03 |
| **I. Analytics** | |
| Booking statistics | ANLT-01 |
| Daily and monthly booking charts | ANLT-02, ANLT-03 |
| Resource usage | ANLT-04 |
| Booking status distribution | ANLT-05 |
| Date filters | ANLT-06 |
| **J. Embed Widget** | |
| Generate an embeddable booking widget | EMBED-01 |
| Support an iframe or JavaScript embed | EMBED-02 |
| Offer different display layouts | EMBED-03 |
| Allow light and dark themes | EMBED-04 |
| Allow background customization | EMBED-05 |
| Provide a live preview | EMBED-06 |
| Generate copyable embed code | EMBED-07 |
| **K. Subscription and Billing** | |
| Free plan (1 workspace, 3 resources, 100 requests/month, basic analytics, basic widget) | BILL-01 |
| Pro plan (5 workspaces, 25 resources, 1,000 requests/month, advanced analytics, customizable widget, $9.99/month) | BILL-02 |
| Subscription page | BILL-03 |
| Stripe Checkout | BILL-04 |
| Stripe webhook integration | BILL-05, SEC-04 |
| Subscription status management | BILL-06 |
| Usage restrictions | BILL-07 |
| Upgrade and cancellation workflows | BILL-08, BILL-09 |
| Use Stripe test mode during development | BILL-04 |

Requirements that come from other parts of the master prompt or from an approved decision, not from a section 4 bullet:

| Requirement | Comes from |
|---|---|
| ROLE-01, ROLE-02 | Master prompt 2 (main user roles) |
| SEC-01 | Master prompt 1, rule 13 |
| SEC-02, SEC-03 | Master prompt 10 (security and authorization review) |
| SEC-06 | Decisions D14, D24 |
| ISO-01, ISO-02, ISO-03 | Master prompt 5 (organization isolation, public access) |
| PERF-01, PERF-02 | Decision D21 |
| RESP-01, RESP-02 | Master prompt 10 (responsive design) · Decision D22 |
