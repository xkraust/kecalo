import type { LeadStatus } from "@/lib/types";

// Barvy vycházejí z palety StatusBadge; updated používá korálový akcentní
// podklad, in_progress šedo-modrou (v paletě dokumentů nemá protějšek).
const styles: Record<LeadStatus, { bg: string; text: string; label: string }> =
  {
    new: { bg: "#FAEEDA", text: "#854F0B", label: "Nová" },
    updated: { bg: "#FAECE7", text: "#C24E29", label: "Rozšířená" },
    in_progress: { bg: "#E8EEF5", text: "#3B5A7A", label: "Ve zpracování" },
    closed: { bg: "#E1F5EE", text: "#0F6E56", label: "Uzavřená" },
  };

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const s = styles[status] ?? styles.new;
  return (
    <span
      className="inline-block rounded-md px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}
