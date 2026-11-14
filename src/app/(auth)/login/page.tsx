import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { FormField } from "@/components/form-field";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Log in" };

// Shell only: no login logic yet (Phase 7). The button is disabled on purpose.
export default function LoginPage() {
  return (
    <>
      <AuthCard
        title="Log in"
        description="Welcome back. Log in to manage your bookings."
        footer={
          <>
            <span>New to SlotMate?</span>
            <Link href="/signup" className="rounded-sm font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Create an account
            </Link>
          </>
        }
      >
        <form className="grid gap-4" noValidate>
          <FormField id="login-email" label="Email">
            {(props) => (
              <Input {...props} name="email" type="email" autoComplete="email" className="h-10 text-base md:text-sm" />
            )}
          </FormField>
          <FormField id="login-password" label="Password">
            {(props) => (
              <Input {...props} name="password" type="password" autoComplete="current-password" className="h-10 text-base md:text-sm" />
            )}
          </FormField>
          <Button type="submit" className="h-10" disabled>
            Log in
          </Button>
        </form>
        <Link
          href="/forgot-password"
          className="justify-self-center rounded-sm text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Forgot your password?
        </Link>
      </AuthCard>
      <div className="w-full max-w-md">
        <PlaceholderNotice phase="Phase 7">
          Authentication is not built yet, so this form does nothing.
        </PlaceholderNotice>
      </div>
    </>
  );
}
