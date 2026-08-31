import { supabase } from "@/lib/supabase";
import { JobRolesClient } from "./client";
import type { AudienceWithUsage, JobRoleWithUsage } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function JobRolesPage() {
  const [roles, audiences, links, members] = await Promise.all([
    supabase
      .from("job_roles")
      .select("code, label, description, created_at")
      .order("label"),
    supabase.from("audiences").select("code, label, created_at").order("label"),
    supabase.from("job_role_audiences").select("job_role_code, audience_code"),
    supabase.from("user_job_roles").select("job_role_code"),
  ]);

  const items: JobRoleWithUsage[] = (roles.data ?? []).map((r) => ({
    code: r.code,
    label: r.label,
    description: r.description,
    created_at: r.created_at,
    audiences: (links.data ?? [])
      .filter((l) => l.job_role_code === r.code)
      .map((l) => l.audience_code as string),
    member_count: (members.data ?? []).filter((m) => m.job_role_code === r.code)
      .length,
  }));

  const audienceList: AudienceWithUsage[] = (audiences.data ?? []).map((a) => ({
    code: a.code,
    label: a.label,
    created_at: a.created_at,
    document_count: 0,
    job_role_count: 0,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium">Pracovní role</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kdo je uživatel v organizaci. Role sdružuje štítky publika — uživatel
          dostane roli a štítky z ní odvodí. Přiřazují se v sekci Účty.
        </p>
      </div>
      <JobRolesClient roles={items} audiences={audienceList} />
    </div>
  );
}
