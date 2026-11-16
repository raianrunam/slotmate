# SlotMate — Demo script (3 to 4 minutes)

Target length: **3:50**. Each step has a time, what to click, and **one sentence to say**. The demo runs on the live site, https://slotmate-lac.vercel.app, in Stripe **test mode**.

## Before you record (5 minutes, not in the video)

- Use two browser windows: a normal one for the owner, and a second one (or a private window) resized to a **phone width, about 375 px** (browser developer tools, device toolbar) for the visitor.
- Have a real inbox ready for the sign-up email, and open the Supabase-sent email in a tab so the click is quick. Supabase's built-in email service sends only a few emails per hour, so do **not** repeat the sign-up many times. If you want to skip the wait, sign up once before recording and start the video at the login screen (change step 2).
- A link from the sign-up email must be opened **in the same browser** that asked for it.
- Keep the Stripe test card at hand: `4242 4242 4242 4242`, any future expiry date, any 3-digit security code, any postcode.
- Use fake names and a fake visitor email in the booking (for example `visitor@example.com`). Do not show your own inbox address or any key, and keep the browser developer tools closed except for the phone-width step.
- Do a full dry run once, and note that the owner's dashboard must show the new workspace before the visitor step.

## The script

| Time | Screen and clicks | What to say (one sentence) |
|---|---|---|
| **0:00–0:15** | **Landing page.** Show the hero, scroll to the Free and Pro pricing cards. | "SlotMate lets people request a time slot on a public page, and lets the owner approve each request from one dashboard." |
| **0:15–0:35** | **Sign up / log in.** Click *Sign up*, enter an email and a password of at least 8 characters, submit. Open the email, click the link, land on the dashboard. | "Owners register with email confirmation, and the dashboard is protected: a logged-out visitor is sent back to the login page." |
| **0:35–1:05** | **Set up.** In the sidebar open *Workspaces* and create "Sunrise Studio" with a London time zone. Open *Resources* and add "Meeting room A", 60 minutes, capacity 8. Open *Availability* and set Monday to Friday, 09:00 to 17:00. | "An owner makes a workspace with its own time zone, adds something bookable, and sets weekly opening hours, and the slots are cut from the slot length." |
| **1:05–1:40** | **Public booking on a phone.** In the phone-width window open `/book/<your workspace address>`. Choose Meeting room A, pick a date and a free time, type a name and a fake email, press *Request booking*. On the success message, copy the private status link. | "A visitor books without an account, on a phone, and gets a private link to follow the request, and the database makes a double booking impossible." |
| **1:40–2:00** | **Owner approves.** Back in the owner window open *Bookings* (note the pending badge), open the new request, press *Approve*. | "The owner sees the pending request, approves it in one click, and the status change is checked by a database trigger, not only by the page." |
| **2:00–2:15** | **Status page updates.** In the phone-width window open the private status link (or reload it). It now says approved. | "The visitor's private page now shows the request as approved." |
| **2:15–2:40** | **Analytics.** Open *Analytics*. Point at requests per day and by status. Open one "View as a table". Point out that the monthly chart and resource usage are Pro features. | "Analytics count requests in the workspace's own time zone, every chart has a text table, and the advanced charts are for Pro owners." |
| **2:40–3:00** | **Widget.** Open *Widget*. Switch the theme, copy the embed code, and show the preview. | "The booking page can be embedded in any website with one iframe snippet, and the colour and layout options are Pro only." |
| **3:00–3:25** | **Upgrade with the test card.** Open *Billing*, press the upgrade button, pay with `4242 4242 4242 4242` on Stripe's page, return to *Billing*. It now says Pro, with the new limits. | "Upgrading goes through Stripe Checkout in test mode, and a signed webhook that asks Stripe for the real subscription is what makes the owner Pro." |
| **3:25–3:50** | **Tests and agentic tools.** Show the README test section, then `docs/AGENTIC_TOOLS.md` (the table at the top). | "It has 433 unit checks, 400 browser tests and 94 database tests, all passing on the last full run, and it was built with Claude Code using written rules, hooks, reviewer subagents, a skill and parallel worktrees, with the evidence in the repository." |

## Notes for the speaker

- If a step is slow (for example the email), cut it in editing rather than waiting on camera.
- Say "test mode" once, near the payment, so nobody thinks real money moves.
- If something fails on camera, say what happened and move on; the honest development log in `docs/DEVELOPMENT_LOG.md` shows the project is open about problems.
- After recording, put the video link in `README.md` (the "Demo video" section) and in `docs/SUBMISSION_CHECKLIST.md`.
