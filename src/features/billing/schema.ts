import { z } from "zod";
import { PLAN_LIMITS, type PlanId } from "@/lib/plans";

// Pure rules for billing (no server imports, so they can be unit tested).

// -----------------------------------------------------------------------------
// Webhook routing
// -----------------------------------------------------------------------------

/** The only event types we act on. Everything else is acknowledged and ignored. */
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;
export type HandledEvent = (typeof HANDLED_EVENTS)[number];

export function isHandledEvent(type: string): type is HandledEvent {
  return (HANDLED_EVENTS as readonly string[]).includes(type);
}

const idOf = (value: unknown): string | null => {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
};

export interface EventTarget {
  /** The Stripe subscription to re-fetch. The event body is used ONLY to find this (A14). */
  subscriptionId: string | null;
  customerId: string | null;
  /** Our owner id as tagged at checkout (only present on checkout.session.completed). */
  clientReferenceId: string | null;
  /** True when Stripe says the subscription no longer exists. */
  deleted: boolean;
}

/**
 * Reads only the identifiers out of an event. State (plan, status, dates) is
 * NEVER taken from the message; it comes from Stripe's current answer (A14).
 * Returns null for event types we do not handle or a checkout that is not a subscription.
 */
export function eventTarget(event: { type: string; data: { object: unknown } }): EventTarget | null {
  if (!isHandledEvent(event.type)) return null;
  const object = (event.data.object ?? {}) as Record<string, unknown>;
  if (event.type === "checkout.session.completed") {
    if (object.mode !== "subscription") return null;
    const subscriptionId = idOf(object.subscription);
    if (!subscriptionId) return null;
    return {
      subscriptionId,
      customerId: idOf(object.customer),
      clientReferenceId: typeof object.client_reference_id === "string" ? object.client_reference_id : null,
      deleted: false,
    };
  }
  const subscriptionId = idOf(object.id);
  if (!subscriptionId) return null;
  return {
    subscriptionId,
    customerId: idOf(object.customer),
    clientReferenceId: null,
    deleted: event.type === "customer.subscription.deleted",
  };
}

// -----------------------------------------------------------------------------
// Plan mapping (DB7)
// -----------------------------------------------------------------------------

export interface StripeSubscriptionLike {
  id: string;
  status: string;
  customer: unknown;
  cancel_at_period_end: boolean;
  items: { data: { current_period_end?: number | null }[] };
}

export interface SubscriptionRow {
  plan: PlanId;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/** Stripe statuses where the subscription is over or never became real. */
const ENDED = new Set(["canceled", "incomplete_expired", "incomplete"]);

/**
 * Turns Stripe's current subscription into our row.
 *  * canceled / incomplete(_expired): plan free, no subscription id (DATABASE.md check
 *    "free or has a subscription id" holds either way).
 *  * anything else: plan pro with Stripe's own status word. Whether it counts as Pro
 *    is decided by current_plan() (DB7: only active or trialing). past_due therefore
 *    loses Pro at once, a documented limitation.
 */
export function mapSubscription(sub: StripeSubscriptionLike): SubscriptionRow {
  const customer = idOf(sub.customer);
  if (ENDED.has(sub.status)) {
    return {
      plan: "free",
      status: sub.status,
      stripe_customer_id: customer,
      stripe_subscription_id: null,
      current_period_end: null,
      cancel_at_period_end: false,
    };
  }
  const end = sub.items.data
    .map((item) => item.current_period_end)
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => b - a)[0];
  return {
    plan: "pro",
    status: sub.status,
    stripe_customer_id: customer,
    stripe_subscription_id: sub.id,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
  };
}

/** The row we write when Stripe says the subscription is gone (event: deleted). */
export function endedRow(customerId: string | null): SubscriptionRow {
  return {
    plan: "free",
    status: "canceled",
    stripe_customer_id: customerId,
    stripe_subscription_id: null,
    current_period_end: null,
    cancel_at_period_end: false,
  };
}

export const uuidSchema = z.uuid();

// -----------------------------------------------------------------------------
// Downgrade selection (A18, S2, DB17)
// -----------------------------------------------------------------------------

export interface SelWorkspace {
  id: string;
  name: string;
  is_locked: boolean;
}
export interface SelResource {
  id: string;
  name: string;
  workspace_id: string;
  is_locked: boolean;
}

const FREE = PLAN_LIMITS.free;

/** True when the owner holds more than the Free plan allows. */
export function overFreeLimits(workspaces: readonly unknown[], resources: readonly unknown[]): boolean {
  return workspaces.length > FREE.maxWorkspaces || resources.length > FREE.maxResources;
}

/**
 * DATABASE.md 7.8 "valid selection": exactly one unlocked workspace, at most three
 * unlocked resources, all of them in that workspace. An empty unlocked set is NOT valid.
 */
export function hasValidSelection(workspaces: readonly SelWorkspace[], resources: readonly SelResource[]): boolean {
  const open = workspaces.filter((w) => !w.is_locked);
  if (open.length !== 1) return false;
  const openResources = resources.filter((r) => !r.is_locked);
  return openResources.length <= FREE.maxResources && openResources.every((r) => r.workspace_id === open[0].id);
}

/** The owner (on Free) must choose what stays active. Never chosen for them. */
export function selectionNeeded(
  plan: PlanId,
  workspaces: readonly SelWorkspace[],
  resources: readonly SelResource[],
): boolean {
  return plan === "free" && overFreeLimits(workspaces, resources) && !hasValidSelection(workspaces, resources);
}

export const SELECTION_MESSAGES = {
  notNeeded: "You are within the Free plan limits, so there is nothing to choose.",
  invalid:
    "That choice is not allowed. Pick exactly one workspace and up to three resources that belong to it.",
  workspace: "Choose one workspace to keep active.",
  tooMany: `You can keep at most ${FREE.maxResources} resources active.`,
  generic: "Something went wrong. Please try again.",
} as const;

export interface SelectionFormState {
  status: "idle" | "error";
  message?: string;
}

export interface BillingActionState {
  status: "idle" | "error";
  message?: string;
}

export const MESSAGES = {
  alreadyPro: "You already have a Pro subscription. Use Manage subscription to change or cancel it.",
  noCustomer: "There is no payment account to manage yet. Upgrade to Pro first.",
  stripeDown: "We could not reach the payment service. Please try again in a moment.",
} as const;

/** Maps a Postgres error text from apply_downgrade_selection to a fixed sentence. */
export function mapSelectionError(error: { code?: string | null; message?: string | null }): string {
  const message = error.message ?? "";
  if (message.includes("selection_not_needed")) return SELECTION_MESSAGES.notNeeded;
  if (message.includes("invalid_selection")) return SELECTION_MESSAGES.invalid;
  return SELECTION_MESSAGES.generic;
}

// -----------------------------------------------------------------------------
// Write decisions (review of Phase 15)
// -----------------------------------------------------------------------------

/** True when the subscription contains the Pro price. Anything else is not ours (another product, a plan switch). */
export function containsProPrice(
  sub: { items: { data: { price?: { id?: string | null } | null }[] } },
  proPriceId: string,
): boolean {
  return sub.items.data.some((item) => item.price?.id === proPriceId);
}

export type WriteDecision = "save" | "ignore_stale_end" | "ignore_second";

/**
 * What to do with the state Stripe just gave us, given the subscription we already store:
 *  * an ending (Free) state for an OLD subscription must not wipe a different, current one;
 *  * a Pro state for a DIFFERENT subscription must not replace the stored one (a second paid
 *    subscription would otherwise silently take over and the first would bill with nothing pointing at it).
 */
export function decideWrite(
  row: Pick<SubscriptionRow, "plan">,
  storedSubscriptionId: string | null,
  incomingSubscriptionId: string,
): WriteDecision {
  if (!storedSubscriptionId || storedSubscriptionId === incomingSubscriptionId) return "save";
  return row.plan === "free" ? "ignore_stale_end" : "ignore_second";
}

export function sameRow(a: SubscriptionRow, b: SubscriptionRow): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The row for a subscription Stripe just described. A subscription that no longer contains our Pro price
 * (price rotation, plan switch) is NOT Pro any more: the row ends as Free (DATABASE.md 7.6, Phase 17).
 */
export function rowFromStripe(
  sub: StripeSubscriptionLike & { items: { data: { price?: { id?: string | null } | null; current_period_end?: number | null }[] } },
  proPriceId: string,
): SubscriptionRow {
  return containsProPrice(sub, proPriceId) ? mapSubscription(sub) : endedRow(idOf(sub.customer));
}
