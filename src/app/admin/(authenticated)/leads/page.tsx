import { supabase } from "@/lib/supabase";
import type { Lead } from "@/lib/types";
import { LeadsPageClient } from "./client";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { data } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  const leads = (data ?? []) as Lead[];
  // Nevyřízené stavy první, uzavřené na konci; uvnitř skupin created_at desc
  // (drží řazení z dotazu).
  const sorted = [
    ...leads.filter((l) => l.status !== "closed"),
    ...leads.filter((l) => l.status === "closed"),
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium">Poptávky</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Kontakty návštěvníků se zájmem o pojistné produkty
        </p>
      </div>
      <LeadsPageClient leads={sorted} />
    </div>
  );
}
