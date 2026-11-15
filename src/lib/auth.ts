import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface Owner {
  id: string;
  email: string;
}

// Layer 2 of 3 (A3). Asks Supabase Auth to verify the login token (getUser
// does not trust the cookie contents) once per request. The owner's id always
// comes from here, never from anything the browser sends (AUTH-05).
export const getOwner = cache(async (): Promise<Owner | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error || !user || !user.email || !user.email_confirmed_at) return null;
  return { id: user.id, email: user.email };
});

// For every dashboard page and every Server Action that changes owner data.
export async function requireOwner(): Promise<Owner> {
  const owner = await getOwner();
  if (!owner) redirect("/login");
  return owner;
}
