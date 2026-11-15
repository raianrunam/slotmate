Workspace management (Phase 8): create, edit and delete workspaces, the public address (slug), the time zone, plan-limit usage and the locked state.

- `actions.ts`: Server Actions (owner check, owner's own session, friendly error messages, one retry on a deadlock).
- `queries.ts`: reads (list, one workspace, "1 of 1 workspaces" usage).
- `schema.ts`: input rules, slug suggestion, time zone list (pure, also used by the form).
- `db-errors.ts`: maps database errors to fixed friendly messages (pure).
- `components/`: the form, the delete button with its confirmation dialog, the limit notice.
