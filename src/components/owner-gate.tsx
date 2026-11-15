import { requireOwner } from "@/lib/auth";

// Wrap the content of EVERY dashboard page in this. Cookies are read here, so
// the dashboard's loading.tsx (a Suspense boundary) must sit above it. A unit
// test checks that no dashboard page forgets it.
export async function OwnerGate({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return children;
}
