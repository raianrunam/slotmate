import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { PageNotices } from "@/features/auth/components/page-notices";

export const metadata: Metadata = { title: "Forgot password" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function ForgotContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email and we will send you a link to choose a new password."
      footer={
        <Link href="/login" className="rounded-sm font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Back to log in
        </Link>
      }
    >
      <PageNotices params={params} />
      <ForgotPasswordForm />
    </AuthCard>
  );
}

export default function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AuthCard title="Reset your password"><div className="h-32" /></AuthCard>}>
      <ForgotContent searchParams={searchParams} />
    </Suspense>
  );
}
