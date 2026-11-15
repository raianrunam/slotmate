"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { logIn } from "@/features/auth/actions";
import { initialFormState } from "@/features/auth/state";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(logIn, initialFormState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormField id="login-email" label="Email" error={state.fieldErrors?.email}>
        {(props) => (
          <Input {...props} name="email" type="email" autoComplete="email" defaultValue={state.email} className="h-10 text-base md:text-sm" />
        )}
      </FormField>
      <FormField id="login-password" label="Password" error={state.fieldErrors?.password}>
        {(props) => (
          <Input {...props} name="password" type="password" autoComplete="current-password" className="h-10 text-base md:text-sm" />
        )}
      </FormField>
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
