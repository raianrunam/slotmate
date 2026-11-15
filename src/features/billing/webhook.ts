import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ConfigError,
  getProPriceId,
  getStripe,
  getWebhookSecret,
  SIGNATURE_TOLERANCE_SECONDS,
} from "@/lib/stripe/client";
import { withDeadlockRetry } from "@/features/workspaces/db-errors";
import {
  containsProPrice,
  decideWrite,
  endedRow,
  eventTarget,
  isHandledEvent,
  rowFromStripe,
  sameRow,
  uuidSchema,
  type EventTarget,
  type SubscriptionRow,
} from "@/features/billing/schema";

// The Stripe webhook (BILL-05, SEC-04, A14, A2, A4 "place 4": the admin connection).
//
// Order, and why:
//  1. Refuse a missing signature or an oversized body, then read the RAW body (the signature
//     is computed over the exact bytes).
//  2. Verify the signature BEFORE anything else. Failure -> 400, nothing touched.
//  3. Ignore event types we do not handle (200).
//  4. claim_stripe_event: a message already handled does nothing (A14, T15).
//  5. Take only the subscription ID from the message and ASK STRIPE for its current
//     state. The message body is never trusted for plan, status or dates.
//  6. Only a subscription that contains OUR Pro price counts. Find the owner, save the
//     state with the admin connection, ask Stripe once more and correct the row if the state
//     moved meanwhile (two different messages can run at the same time), then mark processed.
//
// Failure after the claim answers 500 so Stripe retries; that is safe because the saved data
// always comes from Stripe's current answer (DATABASE.md 7.6). Only error codes are logged,
// never message bodies, customer data or keys.
//
// A write cancelled by a deadlock (40P01) is retried once here (owner decision, DATABASE.md 7.10);
// any other failure answers 500 and relies on Stripe's retry. The header comment of the pushed functions
// migration ("the webhook does not retry itself") is outdated and is not edited.

const MAX_BODY_BYTES = 1_000_000;

/** What the handler talks to. Production uses the real clients; tests pass stand-ins. */
export interface WebhookDeps {
  stripe: () => Stripe;
  admin: () => ReturnType<typeof createAdminClient>;
}
const realDeps: WebhookDeps = { stripe: getStripe, admin: createAdminClient };

/**
 * Reads the body but stops as soon as it is larger than the limit (a chunked request has no
 * Content-Length to check first). null = too large.
 */
export async function readCappedBody(request: Request, limit = MAX_BODY_BYTES): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });
const tryAgain = () => json(500, { error: "try_again" });

function logFailure(step: string, error: { code?: string | null } | null | undefined) {
  console.error("stripe webhook failed", { step, code: error?.code ?? null });
}

type Admin = ReturnType<typeof createAdminClient>;

interface OwnerMatch {
  ownerId: string;
  currentSubscriptionId: string | null;
  currentCustomerId: string | null;
}

const COLUMNS = "owner_id, stripe_subscription_id, stripe_customer_id";
const toMatch = (r: { owner_id: string; stripe_subscription_id: string | null; stripe_customer_id: string | null }): OwnerMatch => ({
  ownerId: r.owner_id,
  currentSubscriptionId: r.stripe_subscription_id,
  currentCustomerId: r.stripe_customer_id,
});

function customerIdOf(subscription: Stripe.Subscription): string | null {
  const c = subscription.customer;
  return typeof c === "string" ? c : (c?.id ?? null);
}

async function findOwner(
  admin: Admin,
  target: EventTarget,
  subscription: Stripe.Subscription | null,
): Promise<OwnerMatch | null | "error"> {
  const lookups: [string, string, string | null][] = [
    ["find_by_subscription", "stripe_subscription_id", target.subscriptionId],
    ["find_by_customer", "stripe_customer_id", target.customerId ?? (subscription ? customerIdOf(subscription) : null)],
  ];
  for (const [step, column, value] of lookups) {
    if (!value) continue;
    const res = await admin.from("subscriptions").select(COLUMNS).eq(column, value).maybeSingle();
    if (res.error) {
      logFailure(step, res.error);
      return "error";
    }
    if (res.data) return toMatch(res.data);
  }
  // First time we see this customer: the owner id we tagged at checkout (signed event
  // field, or metadata on the subscription that Stripe just returned to us).
  const tagged = target.clientReferenceId ?? subscription?.metadata?.owner_id ?? null;
  const parsed = uuidSchema.safeParse(tagged);
  if (!parsed.success) return null;
  const res = await admin.from("subscriptions").select(COLUMNS).eq("owner_id", parsed.data).maybeSingle();
  if (res.error) {
    logFailure("find_by_tag", res.error);
    return "error";
  }
  return res.data ? toMatch(res.data) : null;
}

/**
 * Saves the row ONLY IF the owner's stored subscription id is still the one we based the decision on
 * (Phase 17 review MEDIUM-1: two deliveries for different subscriptions of one owner could each act on an
 * old copy and the later write silently won). "conflict" = someone else changed it meanwhile: answer 500
 * and let Stripe's retry decide again from a fresh read.
 */
async function saveRow(
  admin: Admin,
  ownerId: string,
  row: SubscriptionRow,
  expectedSubscriptionId: string | null,
): Promise<"ok" | "conflict" | "error"> {
  const res = await withDeadlockRetry(() => {
    const base = admin.from("subscriptions").update(row).eq("owner_id", ownerId);
    return (expectedSubscriptionId === null
      ? base.is("stripe_subscription_id", null)
      : base.eq("stripe_subscription_id", expectedSubscriptionId)
    ).select("owner_id");
  });
  if (res.error) {
    logFailure("save_subscription", res.error);
    return "error";
  }
  if (!res.data || res.data.length !== 1) {
    console.error("stripe webhook skipped", { step: "save_conflict", code: null });
    return "conflict";
  }
  return "ok";
}

/** The subscription id stored for this owner right now (null = none, "error" = could not read). */
async function currentStoredId(admin: Admin, ownerId: string): Promise<string | null | "error"> {
  const res = await admin.from("subscriptions").select("stripe_subscription_id").eq("owner_id", ownerId).maybeSingle();
  if (res.error) {
    logFailure("reread_subscription", res.error);
    return "error";
  }
  return res.data?.stripe_subscription_id ?? null;
}

/** Stripe's current answer. null = Stripe no longer has it; "error" = try again later. */
async function fetchSubscription(stripe: Stripe, id: string): Promise<Stripe.Subscription | null | "error"> {
  try {
    return await stripe.subscriptions.retrieve(id);
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    const code = (error as { code?: string } | null)?.code ?? null;
    if (code === "resource_missing") return null;
    logFailure("retrieve_subscription", { code });
    return "error";
  }
}

export async function handleStripeWebhook(request: Request, deps: WebhookDeps = realDeps): Promise<Response> {
  try {
    return await handle(request, deps);
  } catch (error) {
    // A missing server setting is our fault (500, generic body); anything else unexpected too.
    console.error("stripe webhook failed", { step: error instanceof ConfigError ? "configuration" : "unexpected", code: null });
    return tryAgain();
  }
}

async function handle(request: Request, deps: WebhookDeps): Promise<Response> {
  // 1 + 2: signature header and size, then the raw body, before anything else.
  const signature = request.headers.get("stripe-signature");
  if (!signature) return json(400, { error: "invalid_signature" });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json(413, { error: "too_large" });
  const raw = await readCappedBody(request);
  if (raw === null) return json(413, { error: "too_large" });

  const secret = getWebhookSecret(); // a ConfigError here is our fault, not the caller's
  const stripe = deps.stripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret, SIGNATURE_TOLERANCE_SECONDS);
  } catch {
    return json(400, { error: "invalid_signature" });
  }

  // 3: event types we do not act on are acknowledged (Stripe stops retrying).
  if (!isHandledEvent(event.type)) return json(200, { received: true, handled: false });

  const admin = deps.admin();

  // 4: remembered messages.
  const claim = await withDeadlockRetry(() =>
    admin.rpc("claim_stripe_event", { p_event_id: event.id, p_event_type: event.type }),
  );
  if (claim.error) {
    logFailure("claim", claim.error);
    return tryAgain();
  }
  if (claim.data === "duplicate") return json(200, { received: true, duplicate: true });

  const markProcessed = async (): Promise<Response> => {
    const done = await withDeadlockRetry(() => admin.rpc("mark_stripe_event_processed", { p_event_id: event.id }));
    if (done.error) {
      logFailure("mark_processed", done.error);
      return tryAgain();
    }
    return json(200, { received: true });
  };
  const skip = async (reason: string): Promise<Response> => {
    console.error("stripe webhook skipped", { step: reason, code: null });
    return await markProcessed();
  };

  const target = eventTarget(event);
  if (!target) return await markProcessed(); // for example a one-time payment checkout

  // 5: ask Stripe for the subscription's CURRENT state (A14).
  const first = await fetchSubscription(stripe, target.subscriptionId!);
  if (first === "error") return tryAgain();
  const proPriceId = getProPriceId();

  // 6: owner first. The Pro-price check only gates LINKING a subscription we do not store yet;
  // for the stored subscription Stripe's real state always wins, so a subscription that leaves the
  // Pro price (a price rotation, a plan switch in the portal) ends Pro here (MEDIUM-1 of Phase 16).
  const match = await findOwner(admin, target, first);
  if (match === "error") return tryAgain();
  if (!match) return await skip("unknown_owner"); // not one of ours: nothing to change, no retry wanted
  const isStored = match.currentSubscriptionId === target.subscriptionId;
  if (first && !isStored && !containsProPrice(first, proPriceId)) return await skip("not_pro_price");

  let row: SubscriptionRow;
  if (first) {
    row = rowFromStripe(first, proPriceId);
  } else if (target.deleted && isStored) {
    row = endedRow(target.customerId ?? match.currentCustomerId);
  } else {
    return await markProcessed();
  }
  if (row.plan === "free" && row.stripe_customer_id === null) row.stripe_customer_id = match.currentCustomerId;

  const decision = decideWrite(row, match.currentSubscriptionId, target.subscriptionId!);
  if (decision === "ignore_second" && first) {
    // The decision was made on a row read a moment ago: read it again, and only go on if it still holds the same subscription.
    if ((await currentStoredId(admin, match.ownerId)) !== match.currentSubscriptionId) return tryAgain();
    // A second paid subscription for an owner who already has one (MEDIUM-2 of Phase 16): refund and cancel it.
    const outcome = await cancelExtraSubscription(stripe, first, match.currentSubscriptionId!);
    if (outcome === "retry") return tryAgain();
    return await skip(outcome === "cancelled" ? "ignore_second_cancelled" : "ignore_second");
  }
  if (decision !== "save") return await skip(decision);

  if ((await saveRow(admin, match.ownerId, row, match.currentSubscriptionId)) !== "ok") return tryAgain();

  // Two different messages (for example updated and deleted) can run at once and each read an older state.
  // Ask Stripe again and correct the row if it moved meanwhile (twice at most).
  for (let round = 0; round < 2; round++) {
    const fresh = await fetchSubscription(stripe, target.subscriptionId!);
    if (fresh === "error") return tryAgain();
    if (!fresh) break;
    const next = rowFromStripe(fresh, proPriceId);
    if (next.plan === "free" && next.stripe_customer_id === null) next.stripe_customer_id = row.stripe_customer_id;
    if (sameRow(next, row)) break;
    if ((await saveRow(admin, match.ownerId, next, row.stripe_subscription_id)) !== "ok") return tryAgain();
    row = next;
  }
  return await markProcessed();
}

const LIVE_STATES = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

/**
 * The owner already has a stored subscription and a different Pro subscription showed up (two checkouts
 * in two tabs). The extra one is refunded (its latest paid invoice) and cancelled at once, so nobody is
 * billed twice with nothing pointing at it. Only done while the stored subscription is really live in
 * Stripe; otherwise the answer is "retry" (the end of the stored one may simply not be processed yet).
 * Refund first, with a fixed idempotency key: a retry after a half-done run cannot refund twice and a
 * failed refund leaves the subscription alive, so the next delivery tries again.
 */
async function cancelExtraSubscription(
  stripe: Stripe,
  extra: Stripe.Subscription,
  storedId: string,
): Promise<"cancelled" | "retry" | "nothing"> {
  const stored = await fetchSubscription(stripe, storedId);
  if (stored === "error") return "retry";
  if (!stored || !LIVE_STATES.has(stored.status)) return "retry";
  if (!LIVE_STATES.has(extra.status) && extra.status !== "incomplete") return "nothing"; // already over
  try {
    const invoiceId = typeof extra.latest_invoice === "string" ? extra.latest_invoice : (extra.latest_invoice?.id ?? null);
    if (invoiceId) {
      const payments = await stripe.invoicePayments.list({ invoice: invoiceId, status: "paid", limit: 5 });
      for (const p of payments.data) {
        const pi = p.payment.payment_intent;
        const piId = typeof pi === "string" ? pi : (pi?.id ?? null);
        if (!piId) continue;
        try {
          await stripe.refunds.create({ payment_intent: piId }, { idempotencyKey: `slotmate-extra-refund-${piId}` });
        } catch (refundError) {
          // Refunded already (a retry after Stripe's 24-hour idempotency window): that part is done, go on to the cancel.
          if ((refundError as { code?: string } | null)?.code !== "charge_already_refunded") throw refundError;
        }
      }
    }
    await stripe.subscriptions.cancel(extra.id, { prorate: false, invoice_now: false });
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    const code = (error as { code?: string } | null)?.code ?? null;
    logFailure("cancel_extra_subscription", { code });
    return code === "resource_missing" ? "nothing" : "retry";
  }
  console.error("stripe webhook cancelled an extra subscription", { step: "extra_subscription_cancelled", code: null });
  return "cancelled";
}
