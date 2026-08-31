import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session-user";
import { UsersPageClient } from "./client";
import type { AdminUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  // Layout už session ověřil; tady potřebujeme id, aby klient poznal,
  // který řádek je přihlášený uživatel (nesmí deaktivovat sám sebe).
  const me = await getSessionUser();

  const { data } = await supabase
    .from("users")
    .select(
      "id, username, display_name, app_role, auth_provider, is_active, must_change_password, created_at"
    )
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium">Uživatelé</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kdo se smí přihlásit do administrace a co tam smí dělat
        </p>
      </div>
      <UsersPageClient
        users={(data ?? []) as AdminUser[]}
        currentUserId={me?.id ?? ""}
      />
    </div>
  );
}
