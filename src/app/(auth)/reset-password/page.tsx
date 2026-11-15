import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { getOwner } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose a new password" };

// The emailed link (through /auth/confirm) creates a short session. Without one
// there is nothing to reset, so send the visitor to ask for a new link.
async function ResetContent() {
  if (!(await getOwner())) redirect("/forgot-password?error=expired");
  return (
    <AuthCard
      title="Choose a new password"
      description="Pick a password you do not use anywhere else."
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthCard title="Choose a new password"><div className="h-40" /></AuthCard>}>
      <ResetContent />
    </Suspense>
  );
}
