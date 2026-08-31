import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session-user";
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

  return (
    <div className="flex min-h-screen">
      <AdminSidebar appRole={user.appRole} username={user.username} />
      <main className="flex-1 min-w-0 p-8">{children}</main>
    </div>
  );
}
