"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPassword } from "@/features/auth/actions";
import { initialFormState } from "@/features/auth/state";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPassword, initialFormState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <FormField id="reset-password" label="New password" hint="At least 8 characters." error={state.fieldErrors?.password}>
        {(props) => (
          <Input {...props} name="password" type="password" autoComplete="new-password" className="h-10 text-base md:text-sm" />
        )}
      </FormField>
      <FormField id="reset-password-confirm" label="Confirm new password" error={state.fieldErrors?.confirm}>
        {(props) => (
          <Input {...props} name="confirm" type="password" autoComplete="new-password" className="h-10 text-base md:text-sm" />
        )}
      </FormField>
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
