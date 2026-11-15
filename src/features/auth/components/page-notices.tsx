import { FormMessage } from "@/components/form-message";
import { ERROR_NOTICES, NOTICES } from "@/features/auth/flow";

type Params = { [key: string]: string | string[] | undefined };

export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Shows a message chosen by the address (?notice=... or ?error=...). Only keys
// in our own fixed lists are used; the text is never taken from the address.
export function PageNotices({ params }: { params: Params }) {
  const notice = first(params.notice);
  const error = first(params.error);
  const known = notice && Object.hasOwn(NOTICES, notice) ? NOTICES[notice] : null;
  const errorText = error && Object.hasOwn(ERROR_NOTICES, error) ? ERROR_NOTICES[error] : null;
  return (
    <>
      {known ? <FormMessage tone={known.tone} testId="page-notice">{known.text}</FormMessage> : null}
      {errorText ? <FormMessage tone="error" testId="page-error">{errorText}</FormMessage> : null}
    </>
  );
}
