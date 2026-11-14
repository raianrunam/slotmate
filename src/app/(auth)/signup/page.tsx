import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { FormField } from "@/components/form-field";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Sign up" };

// Shell only: no registration logic yet (Phase 7). The button is disabled on purpose.
export default function SignupPage() {
  return (
    <>
      <AuthCard
        title="Create your account"
        description="Start on the Free plan. No card needed."
        footer={
          <>
            <span>Already have an account?</span>
            <Link href="/login" className="rounded-sm font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Log in
            </Link>
          </>
        }
      >
        <form className="grid gap-4" noValidate>
          <FormField id="signup-email" label="Email">
            {(props) => (
              <Input {...props} name="email" type="email" autoComplete="email" className="h-10 text-base md:text-sm" />
            )}
          </FormField>
          <FormField
            id="signup-password"
            label="Password"
            hint="At least 8 characters."
          >
            {(props) => (
              <Input {...props} name="password" type="password" autoComplete="new-password" minLength={8} className="h-10 text-base md:text-sm" />
            )}
          </FormField>
          <Button type="submit" className="h-10" disabled>
            Create account
          </Button>
        </form>
      </AuthCard>
      <div className="w-full max-w-md">
        <PlaceholderNotice phase="Phase 7">
          Registration is not built yet, so this form does nothing.
        </PlaceholderNotice>
      </div>
    </>
  );
}
