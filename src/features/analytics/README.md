# Analytics (Phase 13)

The dashboard charts at `/dashboard/analytics` (ANLT-01 to ANLT-06, DASH-04, DASH-05, D16, A12). Built by a background
subagent in its own git worktree, at the same time as the embed widget (see the development log).

## What an owner sees

- **Workspace selector.** The page shows one workspace. `?workspace=<id>` keeps the choice; the default is the owner's
  first workspace; a foreign or junk id falls back to the first. No workspace gives a friendly empty state.
- **Everyone (Free and Pro):** totals (all, pending, approved, rejected, cancelled), the status distribution, and a
  30-day chart of booking requests received, zero filled. Days are days in the **workspace's time zone** (A12).
- **Pro only:** a monthly chart, resource usage (every resource, most used first, zeros included) and a from/to date
  filter (real dates, from 2020-01-01, at most 366 days, the end not before the start, a future end moves back to today).
- Every chart has a "View as a table" text alternative; meaning is in labels, not colour.

## Data definitions

- "Requests received" counts bookings by `created_at`, bucketed to a calendar day (or month) in the workspace's zone.
- Statuses are the **current** statuses of bookings that still exist. A deleted booking is gone from the charts; the
  month's request allowance (`monthly_usage`, D19) is a different number and is not used here. The page says so.
- Totals and the status chart cover the same period as the charts (Free: the last 30 days including today).
- The first and last month of the monthly chart can be partial (only days inside the period count); the page says so.

## Files

| File | What it does |
|---|---|
| `aggregate.ts` | Pure: the Pro gate `analyticsAccess` (built on `effectivePlan`), range parsing and bounds, day and month bucketing in a zone, zero fill, status totals, resource usage, `collectPages`, `buildAnalytics`. |
| `queries.ts` | Server-only reads with the OWNER's session (RLS, no admin client): the owner's workspaces, the plan, and the bookings of one workspace (an exact count first, then pages of up to 1,000 rows, at most 20,000, with a "truncated" notice). |
| `components/bar-chart.tsx` | The only client component (recharts). It receives plain `{label, value}` numbers. |
| `components/analytics-view.tsx`, `analytics-filters.tsx` | The page sections, the text tables, the locked cards for Free, and a plain GET filter form. |

## Pro gating

One function decides what may be computed. For a Free owner the Pro datasets are **not computed**: the resource column
and the resources table are not read, the monthly and resource keys do not exist in the data, and the locked cards carry
no data, so nothing Pro is in the props, the HTML or the page data. The owner's `from`/`to` are ignored. Pro means plan
`pro` AND status `active` or `trialing` (DB7, Q12); a missing or failed subscription read never guesses Pro.
