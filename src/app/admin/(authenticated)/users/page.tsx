import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/session-user";
import { UsersPageClient } from "./client";
import type { AdminUser, JobRoleWithUsage } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  // Layout už session ověřil; tady potřebujeme id, aby klient poznal,
  // který řádek je přihlášený uživatel (nesmí deaktivovat sám sebe).
  const me = await getSessionUser();

  const [users, roles, links, effective] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, username, display_name, app_role, auth_provider, is_active, must_change_password, created_at"
      )
      .order("created_at", { ascending: true }),
    supabase.from("job_roles").select("code, label, description, created_at").order("label"),
    supabase.from("user_job_roles").select("user_id, job_role_code"),
    // Odvozené štítky i s rolí, ze které plynou — u M:N vazby jinak není
    // poznat, proč někdo na co vidí.
    supabase.from("user_effective_audiences").select("user_id, audience_code, job_role_code"),
  ]);

  const jobRoles: JobRoleWithUsage[] = (roles.data ?? []).map((r) => ({
    code: r.code,
    label: r.label,
    description: r.description,
    created_at: r.created_at,
    audiences: [],
    member_count: 0,
  }));

  const rolesByUser = new Map<string, string[]>();
  for (const l of links.data ?? []) {
    rolesByUser.set(l.user_id, [...(rolesByUser.get(l.user_id) ?? []), l.job_role_code]);
  }
  const audiencesByUser = new Map<string, { code: string; via: string }[]>();
  for (const e of effective.data ?? []) {
    audiencesByUser.set(e.user_id, [
      ...(audiencesByUser.get(e.user_id) ?? []),
      { code: e.audience_code, via: e.job_role_code },
    ]);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium">Uživatelé</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kdo se smí přihlásit do administrace a co tam smí dělat
        </p>
      </div>
      <UsersPageClient
        users={(users.data ?? []) as AdminUser[]}
        currentUserId={me?.id ?? ""}
        jobRoles={jobRoles}
        rolesByUser={Object.fromEntries(rolesByUser)}
        audiencesByUser={Object.fromEntries(audiencesByUser)}
      />
    </div>
  );
}
