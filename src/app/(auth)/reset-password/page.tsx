import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { FormField } from "@/components/form-field";
import { PlaceholderNotice } from "@/components/placeholder-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Choose a new password" };

// Shell only: no password logic yet (Phase 7). The emailed link will land here.
export default function ResetPasswordPage() {
  return (
    <>
      <AuthCard
        title="Choose a new password"
        description="Pick a password you do not use anywhere else."
      >
        <form className="grid gap-4" noValidate>
          <FormField id="reset-password" label="New password" hint="At least 8 characters.">
            {(props) => (
              <Input {...props} name="password" type="password" autoComplete="new-password" minLength={8} className="h-10 text-base md:text-sm" />
            )}
          </FormField>
          <FormField id="reset-password-confirm" label="Confirm new password">
            {(props) => (
              <Input {...props} name="password-confirm" type="password" autoComplete="new-password" minLength={8} className="h-10 text-base md:text-sm" />
            )}
          </FormField>
          <Button type="submit" className="h-10" disabled>
            Save password
          </Button>
        </form>
      </AuthCard>
      <div className="w-full max-w-md">
        <PlaceholderNotice phase="Phase 7">
          Password reset is not built yet, so this form does nothing.
        </PlaceholderNotice>
      </div>
    </>
  );
}
