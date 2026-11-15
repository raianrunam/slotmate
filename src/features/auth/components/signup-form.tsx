"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUp } from "@/features/auth/actions";
import { initialFormState } from "@/features/auth/state";

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initialFormState);

  if (state.status === "success") {
    return <FormMessage tone="success" testId="signup-success">{state.message}</FormMessage>;
  }

  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <FormField id="signup-email" label="Email" error={state.fieldErrors?.email}>
        {(props) => (
          <Input {...props} name="email" type="email" autoComplete="email" defaultValue={state.email} className="h-10 text-base md:text-sm" />
        )}
      </FormField>
      <FormField
        id="signup-password"
        label="Password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      >
        {(props) => (
          <Input {...props} name="password" type="password" autoComplete="new-password" className="h-10 text-base md:text-sm" />
        )}
      </FormField>
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
