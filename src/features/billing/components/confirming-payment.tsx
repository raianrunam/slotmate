"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FormMessage } from "@/components/form-message";

// Shown after Checkout while the plan is still Free: the webhook may be a few seconds late.
// The page re-reads the subscription every 3 seconds, at most 10 times. This changes nothing
// by itself; only the verified webhook can make the owner Pro (BILL-05).
export function ConfirmingPayment() {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      router.refresh();
      if (tries >= 10) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <FormMessage tone="info" testId="confirming-payment">
      Confirming your payment… This page updates by itself. If it still says Free after a minute, refresh it.
    </FormMessage>
  );
}
