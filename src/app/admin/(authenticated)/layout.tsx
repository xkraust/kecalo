import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { SESSION_COOKIE_NAME, verifiedSessionIssuedAt } from "@/lib/auth";
import { isSessionRevoked } from "@/lib/session-revocation";
import { AdminSidebar } from "@/components/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Proxy (edge) ověří podpis+expiraci; revokaci po logoutu (SEC-4) kontrolujeme
  // zde v Node runtimu, aby stránky nešly zobrazit s odhlášeným tokenem.
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME);
  const issuedAt = cookie?.value
    ? await verifiedSessionIssuedAt(cookie.value, config.sessionSecret)
    : null;
  if (issuedAt === null || (await isSessionRevoked(issuedAt))) {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 min-w-0 p-8">{children}</main>
    </div>
  );
}
