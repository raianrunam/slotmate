// Plan limits and plan descriptions, shown on the pricing section, the billing
// page and the upgrade prompts.
//
// IMPORTANT: PLAN_LIMITS mirrors the `plan_limits` table in the database
// (docs/DATABASE.md section 3.3, decision DB6): Free 1 / 3 / 100, Pro 5 / 25 / 1000.
// The database is the source of truth and enforces the limits; these numbers are
// only for display. If either side changes, change both. Test T18 (planned) will
// compare them.
//
// This file contains no secrets and no database access, so it is safe to use in
// both server and browser code (docs/ARCHITECTURE.md section 2, rule 4).

export type PlanId = "free" | "pro";

export interface PlanLimits {
  readonly maxWorkspaces: number;
  readonly maxResources: number;
  readonly maxMonthlyBookings: number;
}

/** Mirrors the plan_limits table (DB6). Do not change without changing the database. */
export const PLAN_LIMITS: Readonly<Record<PlanId, PlanLimits>> = {
  free: { maxWorkspaces: 1, maxResources: 3, maxMonthlyBookings: 100 },
  pro: { maxWorkspaces: 5, maxResources: 25, maxMonthlyBookings: 1000 },
};

export interface PlanDefinition {
  readonly id: PlanId;
  readonly name: string;
  readonly tagline: string;
  /** Monthly price in US dollars (BILL-02). */
  readonly priceMonthlyUsd: number;
  readonly limits: PlanLimits;
  /** Feature lines, in the words of BILL-01 and BILL-02 (limits are listed separately). */
  readonly features: readonly string[];
}

export const PLANS: Readonly<Record<PlanId, PlanDefinition>> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Everything you need to start taking bookings.",
    priceMonthlyUsd: 0,
    limits: PLAN_LIMITS.free,
    features: [
      "Basic analytics",
      "Basic embed widget with light and dark theme",
      "Live widget preview and copyable embed code",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "More room to grow, with advanced analytics and a customizable widget.",
    priceMonthlyUsd: 9.99,
    limits: PLAN_LIMITS.pro,
    features: [
      "Advanced analytics: monthly chart, resource usage and date filters",
      "Customizable widget: grid layout and background colour",
      "Everything in Free",
    ],
  },
};

/** "$9.99" for Pro, "$0" for Free. */
export function formatPrice(plan: PlanDefinition): string {
  return plan.priceMonthlyUsd === 0
    ? "$0"
    : `$${plan.priceMonthlyUsd.toFixed(2)}`;
}

/** The three limit lines for a plan, as shown to the owner. */
export function limitLines(limits: PlanLimits): string[] {
  return [
    `${limits.maxWorkspaces} ${limits.maxWorkspaces === 1 ? "workspace" : "workspaces"}`,
    `${limits.maxResources} resources`,
    `${limits.maxMonthlyBookings.toLocaleString("en-US")} booking requests per month`,
  ];
}
