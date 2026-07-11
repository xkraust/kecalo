import type { LeadType } from "@/lib/types";

// Barvy z palety LeadStatusBadge: produkt neutrální šedá (většinový typ,
// nemá křičet), hodnoceni korálový akcentní podklad (vzešlo z nespokojenosti
// s odpovědí — signál priority pro zpracovatele).
const styles: Record<LeadType, { bg: string; text: string; label: string }> = {
  produkt: { bg: "#F1EFE8", text: "#5F5E5A", label: "Produkt" },
  hodnoceni: { bg: "#FAECE7", text: "#C24E29", label: "Hodnocení" },
};

export function LeadTypeBadge({ type }: { type: LeadType }) {
  // Fallback na produkt — řádky načtené před aplikací migrace 012 pole nemají.
  const s = styles[type] ?? styles.produkt;
  return (
    <span
      className="inline-block rounded-md px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}
