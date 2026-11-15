# Embed widget (Phase 14)

The widget options page `/dashboard/widget` and the widget itself `/embed/<slug>` (EMBED-01 to EMBED-07, D17, D18, D26,
A13). Built by a background subagent in its own git worktree, at the same time as analytics (see the development log).

## For the owner

- Choose a workspace (`?workspace=<id>`, own workspaces only). Options: **theme** light or dark (Free and Pro);
  **layout** list or grid and a **background colour** (`#rrggbb`) are **Pro only**. Free owners see those controls
  disabled with an upgrade note. A locked workspace is read-only.
- A **preview** iframe of the real `/embed/<slug>` shows the **saved** options (not unsaved form state) and reloads after
  a save. A copy button gives the **embed code**: an `<iframe>` with the widget address and a size, nothing else. The
  address starts with `NEXT_PUBLIC_APP_URL` (SlotMate's own configured address), not the address the owner is on.
- Saving is a Server Action: `requireOwner()` first, the owner's own session (RLS), zod validation, only theme, layout
  and background colour are written. A forged Pro-only value from a Free owner is refused by the database trigger
  `enforce_embed_plan_rules` (`pro_only_embed_option`) and shown as a fixed upgrade message.

## For visitors on another website

- `/embed/<slug>` is the public booking flow with minimal chrome and "Powered by SlotMate". A missing, malformed or
  locked workspace shows the same "not found" page as `/book`. Same rate limit, same privacy rules (no owner data, no
  other visitors' details).
- Options are read through the existing public-read module (`public-booking/queries.ts`, `getPublicWorkspace(slug,
  { embed: true })`), which **drops the Pro values for an owner who is not Pro** (EMBED-05) and re-checks the colour.
- **Colour.** A background colour becomes CSS **variables** (`embedColorVariables`): the background, cards, borders, muted
  text and the accent all follow it, and the text colour is whichever of black or white has the better contrast (at
  least 4.5:1). The colour is only ever an exact `#rrggbb`.
- **Theme.** The widget follows the owner's theme, not the visitor's system setting, from the first paint: a tiny static
  script (`public/embed-theme-dark.js` or `-light.js`) runs while the page is parsed, and `EmbedTheme` keeps it.
- After a booking the widget does not redirect (the status page can never be framed): the action returns the status path
  when the form says `embed=1`, and the status link opens in a **new tab**.

## Framing

`src/lib/security-headers.ts` holds the header rules and `next.config.ts` returns them. Only `/embed` and `/embed/*` get
`frame-ancestors *` (no `X-Frame-Options`). Everything else, including `/booking/*` (which also keeps its no-store and
no-referrer rules), keeps `X-Frame-Options: DENY` and `frame-ancestors 'none'`. Each path matches exactly one rule, so the
order of the rules cannot matter (checked with Next.js's own matcher in the unit tests and on a real server in the UI tests).

## Files

`schema.ts` (pure: validation, gating, colour maths, embed code, error mapping), `actions.ts`, `queries.ts`, `state.ts`,
`components/` (`widget-form`, `embed-code`, `embed-theme`).
