import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session-user";
import { fullName } from "@/lib/validation";
import { AdminSidebar } from "@/components/AdminSidebar";
import { oidcStatus } from "@/lib/auth/oidc";
import { getSettings } from "@/lib/settings";
import { config } from "@/lib/config";
import type { DeploymentModeInput } from "@/components/DeploymentMode";

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

  // Provozní režim se ODVOZUJE z reálných hodnot (env + app_settings), nikde
  // se neukládá — viz DeploymentMode. Zajímá jen správce.
  let deployment: DeploymentModeInput | null = null;
  if (user.appRole === "admin") {
    const settings = await getSettings();
    deployment = {
      publicChat: config.publicChat,
      defaultDocumentVisibility: settings.defaultDocumentVisibility,
      leadCaptureEnabled: settings.leadCaptureEnabled,
    };
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar
        appRole={user.appRole}
        displayName={fullName(user.firstName, user.lastName, user.email)}
        // Stav konfigurace zajímá jen správce; ostatní s ním nic neudělají.
        sso={user.appRole === "admin" ? oidcStatus() : null}
        deployment={deployment}
      />
      <main className="flex-1 min-w-0 p-8">{children}</main>
    </div>
  );
}
