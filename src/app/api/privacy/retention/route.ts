// Ruční spuštění retenčního úklidu z /admin/privacy (GDPR etapa B).
// Stejná implementace jako cron — liší se jen autorizací a tím, že se do
// auditu zapíše, kdo úklid vyvolal.
import { NextResponse } from "next/server";
import { requireAppRole } from "@/lib/require-role";
import { runRetention } from "@/lib/privacy/retention";

export const maxDuration = 60;

export async function POST() {
  // Mazání osobních údajů je systémová operace, ne správa obsahu → admin.
  const auth = await requireAppRole("admin");
  if (!auth.ok) return auth.response;

  try {
    const result = await runRetention({ performedBy: auth.user.id });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Ruční retenční úklid selhal:", err);
    return NextResponse.json(
      { error: "Retenční úklid selhal." },
      { status: 500 }
    );
  }
}
