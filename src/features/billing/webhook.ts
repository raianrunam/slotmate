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
  mapSubscription,
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
// NOTE (owner to confirm): a write cancelled by a deadlock (40P01) is retried once here, as the
// Phase 15 brief asked; DATABASE.md 7.10 says the webhook relies on Stripe's retry instead.

const MAX_BODY_BYTES = 1_000_000;

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

async function saveRow(admin: Admin, ownerId: string, row: SubscriptionRow): Promise<boolean> {
  const res = await withDeadlockRetry(() =>
    admin.from("subscriptions").update(row).eq("owner_id", ownerId).select("owner_id"),
  );
  if (res.error) {
    logFailure("save_subscription", res.error);
    return false;
  }
  return true;
}

/** Stripe's current answer. null = Stripe no longer has it; "error" = try again later. */
async function fetchSubscription(id: string): Promise<Stripe.Subscription | null | "error"> {
  try {
    return await getStripe().subscriptions.retrieve(id);
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    const code = (error as { code?: string } | null)?.code ?? null;
    if (code === "resource_missing") return null;
    logFailure("retrieve_subscription", { code });
    return "error";
  }
}

export async function handleStripeWebhook(request: Request): Promise<Response> {
  try {
    return await handle(request);
  } catch (error) {
    // A missing server setting is our fault (500, generic body); anything else unexpected too.
    console.error("stripe webhook failed", { step: error instanceof ConfigError ? "configuration" : "unexpected", code: null });
    return tryAgain();
  }
}

async function handle(request: Request): Promise<Response> {
  // 1 + 2: signature header and size, then the raw body, before anything else.
  const signature = request.headers.get("stripe-signature");
  if (!signature) return json(400, { error: "invalid_signature" });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json(413, { error: "too_large" });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "too_large" });

  const secret = getWebhookSecret(); // a ConfigError here is our fault, not the caller's
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret, SIGNATURE_TOLERANCE_SECONDS);
  } catch {
    return json(400, { error: "invalid_signature" });
  }

  // 3: event types we do not act on are acknowledged (Stripe stops retrying).
  if (!isHandledEvent(event.type)) return json(200, { received: true, handled: false });

  const admin = createAdminClient();

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
  const first = await fetchSubscription(target.subscriptionId!);
  if (first === "error") return tryAgain();
  const proPriceId = getProPriceId();
  // A subscription without our Pro price (another product, a plan switch) is not ours: no change.
  if (first && !containsProPrice(first, proPriceId)) return await skip("not_pro_price");

  // 6: owner and state.
  const match = await findOwner(admin, target, first);
  if (match === "error") return tryAgain();
  if (!match) return await skip("unknown_owner"); // not one of ours: nothing to change, no retry wanted

  let row: SubscriptionRow;
  if (first) {
    row = mapSubscription(first);
  } else if (target.deleted && match.currentSubscriptionId === target.subscriptionId) {
    row = endedRow(target.customerId ?? match.currentCustomerId);
  } else {
    return await markProcessed();
  }
  if (row.plan === "free" && row.stripe_customer_id === null) row.stripe_customer_id = match.currentCustomerId;

  const decision = decideWrite(row, match.currentSubscriptionId, target.subscriptionId!);
  if (decision !== "save") return await skip(decision);

  if (!(await saveRow(admin, match.ownerId, row))) return tryAgain();

  // Two different messages (for example updated and deleted) can run at once and each read an older state.
  // Ask Stripe again and correct the row if it moved meanwhile (twice at most).
  for (let round = 0; round < 2; round++) {
    const fresh = await fetchSubscription(target.subscriptionId!);
    if (fresh === "error") return tryAgain();
    if (!fresh || !containsProPrice(fresh, proPriceId)) break;
    const next = mapSubscription(fresh);
    if (sameRow(next, row)) break;
    if (!(await saveRow(admin, match.ownerId, next))) return tryAgain();
    row = next;
  }
  return await markProcessed();
}
