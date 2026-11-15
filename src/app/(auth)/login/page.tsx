import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";
import { first, PageNotices } from "@/features/auth/components/page-notices";
import { safeNext } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Log in" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const linkClass =
  "rounded-sm font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring";

// The address (?notice=, ?error=, ?next=) is read inside <Suspense> because it
// is request data (Cache Components).
async function LoginContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawNext = first(params.next);
  // Only a safe same-site dashboard path is passed on; otherwise nothing.
  const next = rawNext ? safeNext(rawNext) : undefined;
  return (
    <AuthCard
      title="Log in"
      description="Welcome back. Log in to manage your bookings."
      footer={
        <>
          <span>New to SlotMate?</span>
          <Link href="/signup" className={linkClass}>
            Create an account
          </Link>
        </>
      }
    >
      <PageNotices params={params} />
      <LoginForm next={next} />
      <Link
        href="/forgot-password"
        className="justify-self-center rounded-sm text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        Forgot your password?
      </Link>
    </AuthCard>
  );
}

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AuthCard title="Log in"><div className="h-48" /></AuthCard>}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
