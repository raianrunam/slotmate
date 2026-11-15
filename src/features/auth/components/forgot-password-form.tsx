"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPassword } from "@/features/auth/actions";
import { initialFormState } from "@/features/auth/state";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPassword, initialFormState);

  if (state.status === "success") {
    return <FormMessage tone="success" testId="forgot-success">{state.message}</FormMessage>;
  }

  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <FormField id="forgot-email" label="Email" error={state.fieldErrors?.email}>
        {(props) => (
          <Input {...props} name="email" type="email" autoComplete="email" defaultValue={state.email} className="h-10 text-base md:text-sm" />
        )}
      </FormField>
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
