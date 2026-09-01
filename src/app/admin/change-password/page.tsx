// Změna vlastního hesla (etapa B plánu rolí).
// Stránka je ZÁMĚRNĚ mimo route group (authenticated): ten layout na ni
// přesměrovává účty s nezměněným iniciálním heslem, takže uvnitř něj by
// vznikl nekonečný redirect.
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session-user";
import { fullName } from "@/lib/validation";
import { ChangePasswordForm } from "./client";

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  return (
    <ChangePasswordForm
      displayName={fullName(user.firstName, user.lastName, user.email)}
      forced={user.mustChangePassword}
    />
  );
}
