import type { DocumentStatus } from "@/lib/types";

const styles: Record<DocumentStatus, { bg: string; text: string; label: string }> = {
  ready:      { bg: "#E1F5EE", text: "#0F6E56", label: "Připraveno" },
  processing: { bg: "#FAEEDA", text: "#854F0B", label: "Zpracovává se" },
  uploaded:   { bg: "#F1EFE8", text: "#5F5E5A", label: "Nahráno" },
  error:      { bg: "#FCEBEB", text: "#A32D2D", label: "Chyba" },
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const s = styles[status] ?? styles.uploaded;
  return (
    <span
      className="inline-block rounded-md px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}
