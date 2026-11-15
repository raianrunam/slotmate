"use server";

import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { getProPriceId, getStripe } from "@/lib/stripe/client";
import { containsProPrice } from "@/features/billing/schema";

// Server Actions for paying and managing the plan (BILL-04, BILL-08, BILL-09, D23).
//
//  * requireOwner() first; the owner id comes from the verified login, never from the form.
//  * These actions only SEND the owner to Stripe's own pages. They never change the plan:
//    only the verified webhook does (BILL-05, A14). Returning from Checkout changes nothing.
//  * No card data ever reaches SlotMate. No Stripe browser library is used.
//  * Failures send the owner back to the billing page with a fixed ?error= code;
//    Stripe's own error text is never shown and never logged (code only).

const BILLING = "/dashboard/billing";

// Stripe subscription states that mean "already paying (or about to)": never start another.
const LIVE = new Set(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]);


function fail(code: "checkout" | "portal" | "already_pro" | "no_customer"): never {
  redirect(`${BILLING}?error=${code}`);
}

export async function startCheckout(): Promise<void> {
  const owner = await requireOwner();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status, stripe_customer_id, stripe_subscription_id")
    .maybeSingle();
  if (error) {
    console.error("startCheckout failed", { step: "read_subscription", code: error.code });
    fail("checkout");
  }
  // An owner who already has a Stripe subscription cannot start a second one (BILL-08).
  // A subscription that is past due is fixed in the portal, not by paying twice.
  if (data?.stripe_subscription_id) fail("already_pro");

  const base = getEnv().NEXT_PUBLIC_APP_URL;
  const stripe = getStripe();
  let customer = data?.stripe_customer_id ?? null;
  let url: string | null = null;
  try {
    // The webhook may be late: if Stripe already holds a live subscription for this customer, never create a second.
    if (customer) {
      try {
        const live = await stripe.subscriptions.list({ customer, status: "all", limit: 10 });
        if (live.data.some((s) => LIVE.has(s.status) && containsProPrice(s, getProPriceId()))) fail("already_pro");
      } catch (e) {
        unstable_rethrow(e); // lets redirect() through (documented Next.js API)
        // A customer deleted in Stripe cannot be reused: start again with a fresh one.
        if ((e as { code?: string })?.code === "resource_missing") customer = null;
        else throw e;
      }
    }
    const create = (customerId: string | null) =>
      stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: getProPriceId(), quantity: 1 }],
        client_reference_id: owner.id,
        metadata: { owner_id: owner.id },
        subscription_data: { metadata: { owner_id: owner.id } },
        // Reuse the Stripe customer we already know (stored only by the webhook).
        ...(customerId ? { customer: customerId } : {}),
        success_url: `${base}${BILLING}?checkout=success`,
        cancel_url: `${base}${BILLING}?checkout=cancelled`,
      });
    url = (await create(customer)).url;
  } catch (e) {
    unstable_rethrow(e); // lets redirect() through (documented Next.js API)
    console.error("startCheckout failed", { step: "create_session", code: (e as { code?: string })?.code ?? null });
  }
  if (!url) fail("checkout");
  redirect(url);
}

export async function openCustomerPortal(): Promise<void> {
  await requireOwner();
  const supabase = await createClient();
  const { data, error } = await supabase.from("subscriptions").select("stripe_customer_id").maybeSingle();
  if (error) {
    console.error("openCustomerPortal failed", { step: "read_subscription", code: error.code });
    fail("portal");
  }
  if (!data?.stripe_customer_id) fail("no_customer");

  let url: string | null = null;
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${getEnv().NEXT_PUBLIC_APP_URL}${BILLING}`,
    });
    url = session.url;
  } catch (e) {
    console.error("openCustomerPortal failed", { step: "create_session", code: (e as { code?: string })?.code ?? null });
  }
  if (!url) fail("portal");
  redirect(url);
}
