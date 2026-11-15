import { requireOwner } from "@/lib/auth";
import { UserMenu } from "@/components/user-menu";

// Reads the logged-in owner on the server and hands only the email to the menu.
export async function OwnerUserMenu() {
  const owner = await requireOwner();
  return <UserMenu email={owner.email} />;
}
