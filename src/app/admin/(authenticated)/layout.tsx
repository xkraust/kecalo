import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session-user";
import { fullName } from "@/lib/validation";
import { AdminSidebar } from "@/components/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Proxy (edge) ověří podpis+expiraci; identitu, aplikační roli a revokaci
  // kontrolujeme zde v Node runtimu, aby stránky nešly zobrazit s odhlášeným
  // ani deaktivovaným účtem.
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  // Účet s iniciálním heslem od správce se dostane jen na změnu hesla.
  // API vrací pro tytéž účty 403 (requireAppRole) — kdyby platil jen tenhle
  // redirect, stačilo by volat routy přímo.
  if (user.mustChangePassword) redirect("/admin/change-password");

  return (
    <div className="flex min-h-screen">
      <AdminSidebar
        appRole={user.appRole}
        displayName={fullName(user.firstName, user.lastName, user.email)}
      />
      <main className="flex-1 min-w-0 p-8">{children}</main>
    </div>
  );
}
