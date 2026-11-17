# SlotMate: a plain-words project overview

*For the project owner. No coding knowledge needed. Last checked against the project documents on 2026-11-17.*

This document explains SlotMate from the very beginning, as if to a smart friend who has never built software. Every technical word is explained the first time it appears, and again in the glossary at the end (section 13). The people in the examples (Maya, Alex, Sam) are made up. Everything else is taken from the project's own documents: the README, `REQUIREMENTS_CHECKLIST.md`, `DEVELOPMENT_LOG.md`, `AGENTIC_TOOLS.md`, `DEPLOYMENT.md`, `TESTING.md` and the others in this folder.

**Contents**

1. SlotMate in one paragraph
2. The problem it solves
3. Who uses it, and a day in each person's life
4. What you can do with it (Free and Pro)
5. How it works behind the scenes (one booking, step by step)
6. What we used to build it
7. How we kept it safe
8. How it was built (18 phases, AI helpers, your role)
9. Did it fulfil the requirements?
10. Testing
11. Known limitations
12. Problems we hit and how they were solved
13. Glossary

---

## 1. SlotMate in one paragraph

SlotMate is a website where a business can let people book a time slot for something it owns: a meeting room, a desk, a piece of equipment, or an appointment. The person who runs the business (the **owner**) sets up what can be booked and when it is open. Anyone on the internet (a **visitor**) can open the owner's public page, pick a time and send a request, with no account and no password. The owner then looks at the request on a private page and presses **Approve** or **Reject**. There are two plans: **Free**, with small limits, and **Pro** at $9.99 a month, with bigger limits, more charts and a widget you can paste into your own website. The live site is at https://slotmate-lac.vercel.app. It runs in **test mode** for payments, so no real money is ever taken.

## 2. The problem it solves

Imagine Maya, who runs a small co-working space called Riverside Studio. She has one meeting room, Meeting room A, and a few desks to rent by the hour.

**Life before SlotMate:**

- **Phone calls and messages.** People call or message her all day. She is often busy and misses them.
- **Double bookings.** Two people ask for 10:00 to 11:00 on the same day. She wrote the first one on paper and forgot to check. Both arrive. Someone is angry.
- **A messy spreadsheet.** She tried a spreadsheet. It has no rules. Someone typed over a booking, a row got deleted, and she cannot tell which requests are new or already answered.
- **No picture of the business.** She cannot easily answer "How many bookings did I get this month? Which room is used most?"

**Life with SlotMate:**

- Visitors see only the times that are really free, so they cannot ask for a taken slot.
- The system itself refuses a double booking, even if two people press the button at the same second.
- Every request lands in one list, with a status: waiting, approved, rejected or cancelled.
- Charts show how busy each day and month was.

## 3. Who uses it, and how it helps each person

There are two kinds of people in the app. The **owner** has an account and a private dashboard. The **visitor** has no account at all. A Pro customer is simply an owner who pays.

| Person | Has an account? | What they can do |
|---|---|---|
| Owner | Yes (email and password) | Manage workspaces, resources and opening hours; decide on requests; see charts; pay for Pro |
| Visitor | No | See what is free, send a booking request, check its status with a private link |
| Pro customer | Yes, and pays $9.99 a month | Everything an owner can do, with bigger limits and extra features |

### 3.1 A day in the life of the owner (Maya, on the Free plan)

1. **8:30.** Maya opens SlotMate and logs in. The overview page shows how many workspaces, resources and bookings she has, and a bell with a red number: 2 requests are waiting.
2. She opens the bookings list. One request is from Alex Rahman for Meeting room A, tomorrow, 10:00 to 11:00, three people. The time is shown in her own time zone, so there is no confusion.
3. She presses **Approve**. The waiting number drops to 1. Alex's status page changes to "Approved" by itself.
4. The second request is for a time she cannot offer after all. She presses **Reject**. That time becomes free again for other visitors.
5. Later, a client cancels by phone. Maya opens the approved booking and presses **Cancel booking**. SlotMate asks "are you sure?" first, then frees the slot.
6. At the end of the month she looks at the overview: "34 of 100 requests this month". At 80 requests, SlotMate would show her a friendly message about upgrading.

### 3.2 A day in the life of the visitor (Alex)

1. Alex gets a link from Riverside Studio and opens it on a phone. There is no sign-up, no password.
2. The page lists what can be booked, for example "Meeting room A". Alex taps it.
3. Alex picks tomorrow's date. Only times that are free and still in the future are shown. Alex picks **10:00 to 11:00**.
4. Alex types a name, an email, the number of people, and optionally a phone number and a note, then sends the request.
5. A confirmation page appears with a **private status link**. Alex saves it. The page says "Pending: waiting for the owner."
6. An hour later Alex opens the link again. It now says "Approved". Alex turns up at 10:00.

Alex never sees other visitors' names or emails. The status page is hidden from search engines.

### 3.3 A day in the life of a paying Pro customer (Sam, who runs three studios)

1. Sam started on Free but needs more rooms than the limit allows. On the Billing page, Sam presses **Upgrade**.
2. Sam is sent to **Stripe**, a payment company, and pays with a card on Stripe's own page. SlotMate never sees the card number. (In this project, only Stripe's fake test card works, because it runs in test mode.)
3. A moment later Stripe sends SlotMate a "payment done" message (a **webhook**; section 5). Sam's page now says **Pro** and shows the renewal date.
4. Sam creates more workspaces, opens the **Analytics** page and sees the monthly chart and which room is used most, then goes to **Widget**, picks a grid layout and a colour, and copies the embed code for the studio's own website.
5. Months later Sam cancels from the Billing page. Pro stays until the end of the paid period. After that, nothing is deleted. Sam chooses one workspace and up to three resources to keep active, and the rest become read-only until Sam deletes some or upgrades again.

## 4. What you can do with it

### 4.1 Features in everyday words

| Feature | What it means |
|---|---|
| **Accounts** | Owners register with an email and a password. A confirmation email proves the address is real. They can log in, log out and get a new password by email if they forget it. The dashboard is closed to anyone who is not logged in. |
| **Workspaces** | A workspace is "one place the owner manages", like Riverside Studio. It has its own public address (for example `/book/riverside-studio`) and a time zone. |
| **Resources** | A resource is a thing people can book, like Meeting room A. It has a name, a description, an optional picture (JPG, PNG or WebP, up to 2 MB), a slot length (for example 60 minutes) and a capacity (how many people). An on/off switch hides it from visitors. |
| **Weekly opening hours** | For each resource, the owner says which weekdays are open and between which hours. SlotMate cuts those hours into slots. For example, 09:00 to 12:00 with 60-minute slots gives 09:00, 10:00 and 11:00. |
| **Public booking page** | Anyone can open it. They choose a resource, a date (up to 90 days ahead) and a time, give their details and send. No account. |
| **Private status link** | After sending, the visitor gets a long secret link to see "pending", "approved", "rejected" or "cancelled". |
| **Booking management** | The owner sees all requests in a list (20 per page), can search by name or resource, filter by status, open details, and approve, reject, cancel an approved booking or delete one. A red badge counts requests still waiting. |
| **Notifications** | Inside the app only: the red badge for owners, and the status page for visitors. SlotMate does **not** send booking emails (an early decision, called D15). The only emails are the account emails (confirm address, reset password). |
| **Analytics** | Charts of booking requests. Every chart also has a plain text table, for people who cannot see charts. |
| **Embeddable widget** | A small piece of code the owner pastes into their own website. It shows the booking flow inside that site (an **iframe**, a window onto another page). |
| **Billing** | Upgrade through Stripe Checkout, manage or cancel through Stripe's Customer Portal, and a safe downgrade where nothing is deleted. |
| **Light and dark look, phone friendly** | The pages work on a phone, a tablet and a computer. |

### 4.2 Free versus Pro

| | Free | Pro ($9.99 per month) |
|---|---|---|
| Workspaces | 1 | 5 |
| Resources (in total) | 3 | 25 |
| Booking requests per month | 100 | 1,000 |
| Analytics | Basic: totals, status chart, 30-day chart | Also: monthly chart, resource usage ("which room is used most"), date filters |
| Embed widget | Basic: light or dark theme | Also: grid layout and a background colour |

Two details worth knowing. The monthly count includes requests the owner later deletes, so deleting does not give the month's allowance back. And the limits are enforced by the database itself, not only by the buttons on the screen (section 7).

## 5. How it works behind the scenes

First, a few everyday pictures.

- A **website** is like a shop. The **browser** (Chrome, Safari...) is the customer's window onto it.
- The **server** is the shop's back office. The customer never walks in there. Staff check every request, follow the rules and only then touch the records.
- The **database** is a very organised filing cabinet, with one drawer per kind of thing (owners, workspaces, resources, bookings...). Each drawer is a **table**. SlotMate's cabinet has 11 tables.
- An **API key** is a house key. A *publishable* key opens only the front gate (and in SlotMate it opens nothing valuable). A *secret* key is the master key. It stays in the back office and is never put in a public place.
- A **webhook** is a delivery notification from the bank: when something happens (a payment), the bank rings the shop's doorbell and tells it.

### 5.1 One booking, from the click to the approval

Alex books Meeting room A, 10:00 to 11:00.

1. **Alex opens the booking page.** The browser asks the SlotMate server for the page. The server reads the filing cabinet and builds the page, showing only what a visitor may see (never other visitors' details or the owner's private data).
2. **Alex picks 10:00 to 11:00 and sends the form.** The browser sends the form to the server.
3. **The server checks the visitor.** It uses a **rate limit** (a polite bouncer): at most 5 requests per 10 minutes from one visitor to one workspace, so nobody can flood Maya with junk.
4. **The server checks the form.** Is the name there? Is the email shaped like an email? Is the number of people within the room's capacity? A form that skips these checks is not trusted.
5. **The server makes a secret code.** It makes a long random code for Alex's status link. Only a scrambled copy (a **hash**, like a fingerprint that cannot be turned back into the code) is stored. The real code is shown to Alex once.
6. **The server asks the database to save the booking, through one special function.** Visitors have no direct access to the cabinet at all. The function does the final checks inside the cabinet: Is the resource switched on? Is 10:00 a real slot inside opening hours? Is it in the future and within 90 days? Has Maya's monthly limit been reached? And the key one: does another pending or approved booking overlap this time? If yes, the request is refused. This check runs inside the database, so even two people pressing the button at the same second cannot both win (it was tested with 10 simultaneous requests, 20 times in a row).
7. **The booking is saved as "pending".** Alex is shown the confirmation page with the private status link.
8. **Maya's badge goes up.** The next time she opens the dashboard, her red number is higher. The list is read through **row level security**: an automatic rule in the cabinet that says "this owner may only ever see their own rows".
9. **Maya presses Approve.** The server confirms she is logged in and that this booking is hers. The database only allows legal status changes (for example, a rejected booking cannot jump to approved).
10. **Alex's status page now says "Approved".** The 10:00 slot stays taken for everyone else. If Maya had rejected it, the slot would be free again.

### 5.2 The picture

Read from top to bottom. Each box is a part of the system, and each arrow is a message.

| |
|:---:|
| **[ Alex's phone or computer (the browser) ]**<br>opens the booking page, sends the form |
| ▼ |
| **[ SlotMate server on Vercel (the shop's back office) ]**<br>checks the rate limit, checks the form, makes the secret status code |
| ▼ |
| **[ Supabase database (the filing cabinet) ]**<br>one special function re-checks slot, opening hours, limits and overlap, then saves the booking as "pending" |
| ▼ |
| **[ Maya's dashboard (the browser, logged in) ]**<br>red badge goes up, Maya sees only her own rows, presses Approve |
| ▼ |
| **[ SlotMate server and database ]**<br>check she is the owner, change "pending" to "approved" |
| ▼ |
| **[ Alex's status page ]**<br>now shows "Approved" |

And for paying, the picture is shorter:

| |
|:---:|
| **[ Owner presses Upgrade ]** → **[ SlotMate server ]** → **[ Stripe's payment page ]** (the owner pays there) |
| ▼ |
| **[ Stripe sends a signed "payment done" message (webhook) to SlotMate ]** |
| ▼ |
| **[ SlotMate checks the signature, asks Stripe "what is the real state?", saves "Pro" in the database ]** |

Notice that the plan changes **only** after SlotMate has checked a signed message from Stripe and asked Stripe directly. Coming back from the payment page changes nothing by itself.

## 6. What we used to build it

Software is built from ready-made parts, a bit like a kitchen built from a stove, a fridge and cupboards made by different companies. These are the parts in SlotMate.

| Tool | What it is | Why we needed it |
|---|---|---|
| **Next.js** (version 16) | A toolkit for building websites, which runs both the pages people see and the back-office code. | One place for the pages and the server rules, so we did not need two separate systems. |
| **React** (version 19) | A library for building screens out of small reusable pieces (a button, a card, a form). | Reusable pieces keep the look consistent and make changes safer. Next.js is built on it. |
| **TypeScript** | The programming language used. It is like normal JavaScript but it makes you say what kind of thing each value is. | It catches many mistakes (a number used as a name, for example) before the site ever runs. |
| **Tailwind CSS** | A way to style pages (colours, spacing, fonts) with small ready-made labels. | Fast, consistent looks, and light and dark themes, without writing long style sheets. |
| **shadcn/ui** | A set of ready-made interface parts (buttons, dialogs, menus), built on *Radix UI* (accessible behaviour) and *Lucide* (icons). | Accessible, good-looking parts for free, so we did not draw every button from scratch. |
| **Supabase** | A service that hosts the database, the login system and file storage together. | It gave us the filing cabinet, the login desk and the photo store from one provider. |
| **PostgreSQL** | The database software inside Supabase (the filing cabinet itself). | It can enforce strict rules, such as "two bookings may never overlap", on its own. |
| **Supabase Auth** | The login desk: sign-up, confirmation emails, passwords, sessions. | Passwords are risky to handle. A tested service does it safer than home-made code. |
| **Storage** (Supabase) | A cupboard for files, here the resource pictures (2 MB limit, JPEG, PNG or WebP only). | A database is for records, not for pictures. |
| **Stripe** | A payment company. | It takes the card on its own page, so SlotMate never sees card numbers. Test mode only here. |
| **Recharts** | A library that draws charts. | For the analytics charts. |
| **zod** | A small library that checks that typed information has the right shape. | The server's form checks (name present, email shaped like an email...). |
| **Vercel** | A hosting company: it keeps the site running on the internet. | It publishes the site at https://slotmate-lac.vercel.app and updates it when new code is pushed. It runs in Singapore, next to the database. |
| **Playwright** | A tool that drives a real browser by itself, like a robot user. | It runs the automated tests: clicking, typing and checking, and also the database tests. |
| **GitHub** | A website that stores the project's code and every past version. | A saved history of the work, and the link to Vercel for publishing. |
| **Claude Code** | An AI coding assistant that works in the terminal. | The main builder: it read the documents, wrote code and tests and reviewed work, under the owner's direction. |

Smaller helpers also used: **Supabase CLI** (a command-line tool to apply database changes and make types), **axe-core** (an automatic accessibility checker), and a time-zone helper library.

## 7. How we kept it safe

**Privacy: who can see what**

- **Owners see only their own data.** Every table in the cabinet has an automatic "row level security" rule. Even if someone typed another owner's web address by hand, they would get "not found". A test tries this on every table.
- **Visitors get almost nothing.** Visitors have no direct access to the database. The public page is built by the server, which picks only the safe fields. Other visitors' names, emails, phones and notes never appear on a public page.
- **The status link is a secret.** It is a long random code, stored only as a scrambled copy. The status page is hidden from search engines, is never saved in caches, and does not pass its address on to other sites.
- **A real leak was found and fixed.** An early version put the owner's internal id into the public address of resource pictures. A reviewer caught it, and picture addresses were changed.

**Passwords and logins**

- Passwords are handled by Supabase Auth, not by SlotMate. The minimum length is 8.
- The sign-up and "forgot password" pages give the same answer whether or not an address already has an account, so nobody can use them to find out who has an account.
- After a password reset, other open sessions are ended.
- On the live site, the login cookie (the small note the browser keeps to remember you) is **Secure** (only sent over a protected connection) and **HttpOnly** (page scripts cannot read it). The owner checked this by hand.

**Payments**

- Card details are typed on Stripe's page only. SlotMate never sees or stores them.
- The plan changes only after a **signed** message from Stripe, which SlotMate then double-checks by asking Stripe directly. A forged message is refused.
- Owners cannot change their own plan or usage numbers, even by sending hand-made requests.
- A second paid subscription by mistake is refunded and cancelled automatically (found by a reviewer, fixed in Phase 17).
- It runs in test mode only. Live payments are not set up.

**No double booking**

- The rule is inside the database, as the last line of defence: two pending or approved bookings for the same resource may never overlap. Back-to-back bookings (10:00 to 11:00, then 11:00 to 12:00) are fine.
- Tested with simultaneous requests: exactly one winner each time.

**Secrets**

- A **secret** is a password-like value, such as the master key to the database. They live only in the hosting settings and in a local file that is kept out of the public code. The code repository is public, so no key, password, project reference or personal email is in it. The whole history (104 commits at the time) was scanned: no real secret.
- The AI assistant is **not allowed to read** the secret files at all (a rule enforced by the tool, not just a request).
- The deployed web pages were searched for the real secret values: zero matches.

**Other protections**

- A rate limit on the public booking form (5 requests per 10 minutes per visitor per workspace).
- Anything people type, even `<script>` code, is shown as plain text and never run.
- Plan limits and the allowed status changes are enforced in the database, so a request that skips our pages cannot break them.

## 8. How it was built

### 8.1 The 18 phases in plain words

| Phase | In plain words | When |
|---|---|---|
| 1 | Get to know Claude Code and prepare the computer. | Before 2026-11-12 |
| 2 | Create the GitHub project and the empty website. | 2026-11-12 |
| 3 | Write down what the app must do (requirements) and how the parts fit (architecture). | 2026-11-12 |
| 4 | Design the filing cabinet (11 tables, rules) and build it in 8 steps called migrations, with tests. | 2026-11-12 to 11-14 |
| 5 | Write the rule files for the AI (`CLAUDE.md`) and the main documents. | 2026-11-14 |
| 6 | Design the look and build the reusable screen parts. | 2026-11-14 |
| 7 | Sign-up, login, logout, password recovery. | 2026-11-15 |
| 8 | Workspaces. | 2026-11-15 |
| 9 | Resources and their pictures. | 2026-11-15 |
| 10 | Weekly opening hours and slots, including clock-change days. | 2026-11-15 |
| 11 | The public booking page and the status page. | 2026-11-15 |
| 12 | Booking management: the list, details, approve, reject, cancel, delete. | 2026-11-15 |
| 13 | Analytics (built by a helper agent, at the same time as phase 14). | 2026-11-15 |
| 14 | The embeddable widget (built by a second helper agent). | 2026-11-15 |
| 15 | Stripe billing. | 2026-11-15 |
| 16 | The AI tools: automatic guards, custom reviewers, a saved workflow. | 2026-11-15 |
| 17 | Complete testing and bug fixing; the requirements checklist. | 2026-11-15 to 11-16 |
| 18 | Deployment to the internet, README, screenshots and the final submission files. | 2026-11-16 |

### 8.2 How Claude Code and the AI helpers were used

Think of Claude Code as a very fast builder who knows a lot but sometimes makes confident mistakes. So the work was organised like a building site with inspectors.

| Technique | In plain words | What it did here |
|---|---|---|
| **Rule files** (`AGENTS.md`, `CLAUDE.md`) | A written rulebook every AI session reads first. | Examples: never edit a database change that is already applied, never commit secrets, ask before changing the database. |
| **Deny rules** | The tool itself blocks certain actions. | The AI cannot read the secret files, even by accident. |
| **Hooks** | Small automatic guards that run before or after each action, like a security gate. | Block edits to applied database changes; ask the owner before risky commands; block reading secret files; run a code-style check after each edit. They even blocked the AI's own commands that mentioned a secret file. |
| **Independent reviewer subagents** | A *subagent* is a second AI started for one job. A reviewer starts fresh, can only read, and looks at finished work with no memory of how it was built. | After almost every phase. The reports were saved unedited. Almost every review found a real problem (section 12). |
| **Custom subagents** | Reviewers and a test runner with their own saved job description. | `security-reviewer`, `migration-reviewer` (both read-only) and `test-runner` (runs the tests, never edits). |
| **Parallel builders** | Two helper agents building two features at the same time, each in its own separate copy of the project (a *git worktree*). | Phases 13 and 14 ran at the same time for about seven minutes and merged with no conflict. |
| **Test-runner subagent** | A helper that runs every check and sorts any failure into real, flaky or environment problem. | It produced the final test counts in Phase 17b. |
| **Skill** | A saved set of instructions Claude loads when needed. | `slotmate-phase`: the steps of each phase and the known traps. |
| **Playwright MCP** | A way for Claude to control a browser. | Registered in Phase 16. It failed to connect that day and was first used on 2026-11-16 to check the live site and take screenshots. |
| **OpenSpec** | An optional planning tool. | Skipped on purpose (it needed a new package). |

I counted the helper launches in the saved session transcripts: 26 subagent launches in total (18 reviewers including one that failed to start, 2 builders, 5 test-runners and 1 helper that drafted the requirements checklist). 25 actually ran.

### 8.3 Your role

You were the person who directs and checks. In practice:

- You wrote the briefs and approved every plan before code was written.
- You made the decisions the AI was not allowed to make, such as approving each database change, choosing the safer documented rule when a prompt and a document disagreed, and deciding to leave out a demo video.
- You did the checks nobody else could do: real sign-up with a real inbox, a real test payment, checking the cookie settings on the live site, setting up the Stripe and Supabase dashboards.
- You caught what automatic checks missed. The leftover "Placeholder" text on the live landing page was found by you, not by the AI or the tests.
- You insisted on honest records: this project's log lists the AI's mistakes, and several of your own.

The AI refused to continue several times when a condition was not met (for example, it refused to push a database change before a clean re-review). That is the system working as intended.

## 9. Did it fulfil the requirements?

The checklist has **85 requirements**: 74 "Must-have" and 11 "Nice-to-have". The result:

- **82 done, 3 partly done, 0 not done.**
- **All 74 Must-haves are done.**
- The 3 "partly" ones are all Nice-to-haves.

"Done" means there is a test or a dated manual check for it. "Partly" means some part has no test, is manual only, or is not built.

| Area | What it means in plain words | Requirements | Status |
|---|---|---|---|
| ROLE | Two kinds of people: owner and visitor | 2 | 2 done |
| AUTH | Sign up, log in, log out, protected dashboard, safe sessions, password recovery | 6 | 6 done |
| DASH | Dashboard overview: counts, 30-day chart, recent activity | 6 | 6 done |
| WORK | Create, edit, delete workspaces; public address and time zone | 4 | 4 done |
| RES | Create, edit, delete resources; picture, on/off switch, slot length, capacity | 8 | 8 done |
| AVAIL | Opening hours, slots, no overlaps, server-side checking | 5 | 5 done |
| PUB | Public booking page, details, date and time, no sign-up, confirmation | 7 | 7 done |
| BOOK | Booking list, details, approve, reject, cancel, delete, filter, search | 8 | 8 done |
| NOTIF | Messages for the visitor and the owner, inside the app | 3 | 3 done |
| ANLT | Charts and statistics, Pro charts and date filters | 6 | 6 done |
| EMBED | Widget code, themes, Pro colours, preview | 7 | 6 done, 1 partly |
| BILL | Free and Pro plans, Stripe, webhook, limits, upgrade, cancel | 9 | 9 done |
| SEC | No secrets in code, validation, authorization, webhook checks, safe sessions, rate limit | 6 | 6 done |
| ISO | Owners see only their data; visitors see only what booking needs | 3 | 3 done |
| PERF | Fast pages and lists; no double booking under load | 3 | 1 done, 2 partly |
| RESP | Works on a phone, tablet and computer | 2 | 2 done |
| **Total** | | **85** | **82 done, 3 partly, 0 not done** |

### The three "partly" items, explained honestly

| ID | What was asked | What is missing, in plain words |
|---|---|---|
| EMBED-06 | A live preview of the widget that changes as the owner picks options. | The preview shows the real widget, but with the **saved** options. It updates after pressing "Save widget options", not while typing. A true live preview would need a public way to pass unsaved options to the widget, which could let someone skip the Pro-only restriction. So this was left open, as a decision for you. |
| PERF-01 | Pages load in under 3 seconds. | Measured and well under 3 seconds: about 0.3 to 0.4 seconds for public pages on the live site, about 0.9 seconds for the dashboard on the local test machine. But the dashboard and the booking list were **not timed on the live site** (they need a login). One first, cold request took 3.95 seconds. |
| PERF-02 | Lists stay fast with many items. | Lists show 20 rows per page and paging is tested, but there is **no test with 1,000 bookings**. The architecture document itself calls that test optional. |

## 10. Testing

### What "about 930 automated tests" means

An **automated test** is a small robot-run check. It does something to the app (clicks a button, sends a request) and compares the result with what should happen. If the result is wrong, the test fails and shouts. Think of a factory that checks every product on the line, thousands of times, in minutes, without getting tired.

SlotMate has three kinds. The counts are from the final runs (16 November 2026):

| Kind | Count | What it does |
|---|---|---|
| **Unit checks** | 435 | Test small pieces on their own, with no browser or database: "is a 7-letter password refused?", "does 09:00 to 12:00 give the right slots?", "do the safety rules appear in the code?" |
| **UI tests** | 400 | A real browser acts like a user at phone, tablet and computer widths, including accessibility scans (do colours have enough contrast, can the page be used with a keyboard?) |
| **Database tests** | 94 | Talk to the real database through the same doors the app uses and try to break the rules, for example 10 simultaneous bookings for one slot. |
| **Total** | **929** (about 930) | |

The last full runs found none failed and none skipped. The database tests were last run in Phase 17b, because nothing in the database has changed since.

### What the tests prove (and what they cannot)

They prove that:

- the rules we wrote down really work, including the hard ones: no double booking, owners see only their own data, visitors see nothing private, and plan limits hold;
- a mistake in a later change is likely to be caught quickly, because the same tests run again;
- the app stays usable on small screens and passes automatic accessibility scans.

They do **not** prove that:

- there are no bugs at all. A few things were never tested by a person, such as a real phone and a screen reader;
- every real-world situation works, for example a Stripe outage was not tested;
- a test is good. Early on, some tests could not fail; reviewers found this and the tests were made stricter.

## 11. Known limitations

In plain words, and none of these stop the app from working:

- **Test-mode payments only.** The live site uses Stripe's fake test card. No real money can be taken. Live payments are not set up.
- **No booking emails.** Owners and visitors are not emailed about bookings. Notices are inside the app (the badge and the status page). Only account emails (confirm address, reset password) are sent.
- **If a card payment fails, Pro ends at once.** There is no grace period. This was accepted for version 1.
- **The widget preview updates only after saving** (EMBED-06).
- **Some timings not measured on the live site** (PERF-01), and no 1,000-booking test (PERF-02).
- **Odd slot lengths on clock-change days.** Slots shorter than an hour that do not divide an hour (for example 45 minutes) can show a slot that is refused on the two days a year when clocks change. No double booking can happen; a slot just looks free and is refused. 30, 60 and 90 minutes are fine. A fix needs a new database change.
- **Email links work only in the same browser.** The confirm and reset links must be opened in the browser that asked for them.
- **Not tested by a person:** a real phone and a screen reader; the widget pasted into a real third-party website; a few hand-over lists from Phases 12 to 14.
- **Known small things:** a `*` typed in the booking search acts as a wildcard; opening hours are typed as text, not picked from a clock; pictures are checked by their first bytes only; analytics numbers can rarely be off by one if a booking changes mid-load.
- **Security warnings in development tools.** `npm audit` reports 12 findings, all in development tooling, not in the code that runs on the live site. Fixing them would mean a big downgrade, so it was left as a decision for you.
- **No licence chosen yet** for the code.

## 12. Problems we hit and how they were solved

| # | The problem | How it was caught and solved |
|---|---|---|
| 1 | **A slot could be booked wrongly twice a year.** When clocks go back, one hour happens twice. The first version of the booking function treated the wrong copy of that hour, and the end of a slot could land in the wrong copy too. Real slots would have become unbookable. | Independent reviewers caught both versions before the database change was applied. The function was fixed and the AI refused to apply the change until a clean re-review. |
| 2 | **Too much power for the server key.** At first the master key could erase every table. | The first review caught it. The permissions were narrowed to only what the server needs. |
| 3 | **The owner's private id was visible in the public page.** Picture addresses contained it. The privacy test missed it because its test room had no picture. | A reviewer noticed. A new database change (migration 8) changed picture addresses and the test now includes a picture. |
| 4 | **The rate limit could be dodged.** Someone could send each request from a different address in the same internet block, or send many requests at the same moment. | The limit now treats a whole block as one visitor, and a lock makes simultaneous requests wait in line. A test sends 20 at once and exactly 5 get through. |
| 5 | **Sign-up leaked who has an account.** The rate-limit message differed for known and unknown addresses. | A reviewer found it. All outcomes now look the same. |
| 6 | **A custom widget colour made text unreadable.** A navy background kept dark text on dark. | A reviewer found it. The colour now applies to the whole form, and a test measures the contrast of every text. |
| 7 | **A double payment was possible.** If a person paid twice before the first payment was confirmed, they would hold two subscriptions. | Found by a reviewer. The upgrade button now says "please do not pay again" while waiting, and an extra subscription is refunded and cancelled automatically. |
| 8 | **Tests that could not fail.** Some of my early tests passed for the wrong reasons, so a pass meant nothing. | Reviewers pointed it out. After tests were made strict, they found a real bug (a cramped "skip to content" link). Rule: always ask "what would make this test fail?". |
| 9 | **The parallel builders could not run the full tests.** The two helper agents had no secrets, so browser and database problems appeared only after merging. | Everything was fixed in the main folder after the merge. Lesson: build in parallel, then budget time to prove it all together. |
| 10 | **Leftover placeholder text on the live landing page.** "Placeholder" notices and fake clickable buttons were still showing. | Found by you, not by the AI or the tests. Fixed, the extra design page was removed, and two new checks now fail if such leftovers return. |
| 11 | **Claims written before they were true.** The AI once wrote that a documentation review had happened before any review existed. | The next reviewer caught it as its top finding. Rule: write "done" only after the evidence exists. |
| 12 | **The AI made a throw-away test project without asking.** A short-lived Vercel project was created to test one header. | It was harmless and deleted with your approval, but it is recorded as a mistake: ask first. |

Throughout, three habits did the most good: a fresh reviewer after each phase; tests that go through the real doors; and keeping raw evidence instead of trusting summaries.

## 13. Glossary

- **Accessibility:** making a website usable by everyone, including people who use a keyboard only, a screen reader or need strong colour contrast.
- **Analytics:** charts and numbers that show how many bookings came in and when.
- **API key:** a house key for a service. A *secret* one is the master key and must stay private; a *publishable* one is safe to show.
- **Approve / Reject:** the owner's two answers to a booking request.
- **Authentication:** proving who you are, for example by logging in with an email and a password.
- **Authorization:** deciding what a logged-in person is allowed to do.
- **Automated test:** a robot-run check that does something to the app and compares the result with what is expected.
- **Badge:** a small red number, here counting requests that wait for the owner.
- **Booking request:** a visitor asking to use a resource at a certain time. It is "pending" until the owner decides.
- **Browser:** the program you use to open websites, such as Chrome.
- **Capacity:** how many people a resource can take at once.
- **Checkout:** Stripe's own payment page where a card is entered.
- **Claude Code:** the AI coding assistant, used here to build the project.
- **Commit:** one saved step in the project's history.
- **Cookie:** a small note a browser keeps so a website can remember you are logged in.
- **Dashboard:** the owner's private control page.
- **Database:** a very organised filing cabinet where the app keeps its records.
- **Deploy:** put the finished app on the internet so people can use it.
- **Deny rule:** a setting that forbids the AI a certain action.
- **Embed / widget:** a piece of code that shows SlotMate's booking form inside another website.
- **Environment variable:** a named setting kept outside the code, often a secret such as a key.
- **Flaky test:** a test that sometimes fails and sometimes passes without any change to the code.
- **Free plan:** the plan that costs nothing and has small limits.
- **Git:** the tool that records every version of the project.
- **GitHub:** a website that stores the project's code and its history.
- **Git worktree:** a second, separate copy of the project folder on its own branch, used so two helpers can work at the same time without colliding.
- **Hash:** a scrambled fingerprint of a secret that cannot be turned back into the secret.
- **Hook:** a small automatic script that runs before or after an action, like a security gate.
- **iframe:** a window on one web page that shows another web page inside it.
- **Limit (plan limit):** the largest number of workspaces, resources or monthly requests a plan allows.
- **Locked:** read-only because of a plan limit; the data is kept, but cannot be changed.
- **MCP (Model Context Protocol):** a way for the AI to use an outside tool, here a browser.
- **Migration:** one saved change to the database's structure. They run in order and are never edited once applied.
- **Next.js:** the toolkit used to build the website and its back office.
- **Owner:** the person who runs a business on SlotMate.
- **Parallel development:** building two features at the same time.
- **Password recovery:** getting a new password through an emailed link.
- **Pending:** a request waiting for the owner's decision.
- **PKCE:** a safety method for email links, which is why a link must be opened in the same browser that asked for it.
- **Playwright:** a tool that drives a real browser like a robot user, for the tests.
- **PostgreSQL:** the database software inside Supabase.
- **Pro plan:** the paid plan at $9.99 a month with bigger limits and extra features.
- **Rate limit:** a rule that limits how often someone may do something, to stop floods of junk.
- **React:** a library for building screens from small reusable pieces.
- **Recharts:** the library that draws the charts.
- **Repository (repo):** the project's folder of code, kept with its history.
- **Requirement:** one thing the app must do.
- **Resource:** a thing that can be booked, such as Meeting room A.
- **Reviewer subagent:** a fresh, read-only AI that checks finished work.
- **Row level security (RLS):** automatic rules in the database that decide, row by row, who may read or change data.
- **Secret:** a password-like value that must never be public.
- **Server:** the shop's back office: the computer code that checks every request and follows the rules.
- **Server Action:** a server function that a form calls when it is submitted.
- **Session:** the period during which you stay logged in.
- **shadcn/ui:** a set of ready-made interface parts such as buttons and dialogs.
- **Slot:** one bookable time, such as 10:00 to 11:00.
- **Status link / status page:** the visitor's private link for checking their request.
- **Storage:** the cupboard in Supabase where files, here resource pictures, are kept.
- **Stripe:** the payment company that handles upgrading, cancelling and card details.
- **Subagent:** a second AI that the main AI starts to do one job.
- **Supabase:** the service that provides the database, login and file storage.
- **Table:** one drawer in the database filing cabinet.
- **Tailwind CSS:** a way to style web pages with small ready-made labels.
- **Test mode:** a safe practice mode of a payment service, where only fake cards work and no real money moves.
- **Time zone:** the clock region used to show times. Each workspace has one.
- **TypeScript:** the programming language used, which checks the kinds of values before the app runs.
- **Unit test:** a test of one small piece on its own.
- **Vercel:** the company that hosts the live site.
- **Visitor:** a person who books without an account.
- **Webhook:** a delivery notification from the bank: a message that another service sends to our server when something happens.
- **Workspace:** one place an owner manages, with its own public address and time zone.
- **zod:** a small library that checks typed information has the right shape.
