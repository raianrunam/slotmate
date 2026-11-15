# Billing (Phase 15): Stripe in test mode

What is here and why:

- `schema.ts` (pure, unit tested): which Stripe events we handle, how a Stripe subscription becomes our `subscriptions` row (DB7), the Pro-price check, the write decision (a stale ending or a second paid subscription never replaces the stored one) and the downgrade selection rules (DATABASE.md 7.8).
- `webhook.ts` (admin connection, A4 "place 4"): raw body, signature, claim, **ask Stripe for the current subscription**, save, ask again to catch a race, mark processed. Route: `src/app/api/stripe/webhook/route.ts`.
- `actions.ts`: `startCheckout` and `openCustomerPortal`. They only send the owner to Stripe's pages. They never change the plan; only the verified webhook does.
- `downgrade-actions.ts` (admin connection, A4 "place 6"): the owner's choice of 1 workspace and 0-3 resources, checked with the owner's own login first, then `apply_downgrade_selection`.
- `queries.ts`: reads for the billing page, the banner and the upgrade card (owner login, RLS).
- `components/`: the selection form, the "confirming your payment" notice, the downgrade banner.

Pages: `/dashboard/billing` and `/dashboard/billing/downgrade`.

Variable names (ARCHITECTURE section 7): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`. They are read only in `src/lib/stripe/client.ts`.

Stripe Dashboard setting to check by hand (cannot be checked from code): in the Customer Portal settings allow **cancelling at the end of the period** and do **not** allow switching plans. The webhook also ignores any subscription that does not contain the Pro price.
