import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { FormField } from "@/components/form-field";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Forgot password" };

// Shell only: no password-recovery logic yet (Phase 7).
export default function ForgotPasswordPage() {
  return (
    <>
      <AuthCard
        title="Reset your password"
        description="Enter your email and we will send you a link to choose a new password."
        footer={
          <Link href="/login" className="rounded-sm font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Back to log in
          </Link>
        }
      >
        <form className="grid gap-4" noValidate>
          <FormField id="forgot-email" label="Email">
            {(props) => (
              <Input {...props} name="email" type="email" autoComplete="email" className="h-10 text-base md:text-sm" />
            )}
          </FormField>
          <Button type="submit" className="h-10" disabled>
            Send reset link
          </Button>
        </form>
      </AuthCard>
      <div className="w-full max-w-md">
        <PlaceholderNotice phase="Phase 7">
          Password recovery is not built yet, so this form does nothing.
        </PlaceholderNotice>
      </div>
    </>
  );
}
