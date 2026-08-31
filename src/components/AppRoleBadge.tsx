import type { AppRole } from "@/lib/session-user";

// Barvy z palety StatusBadge: admin korálový akcent (nejvyšší oprávnění),
// editor šedo-modrá jako in_progress u poptávek, viewer neutrální šedá.
const styles: Record<AppRole, { bg: string; text: string; label: string }> = {
  admin: { bg: "#FAECE7", text: "#C24E29", label: "Admin" },
  editor: { bg: "#E8EEF5", text: "#3B5A7A", label: "Editor" },
  viewer: { bg: "#F1EFE8", text: "#5F5E5A", label: "Čtenář" },
};

export function AppRoleBadge({ role }: { role: AppRole }) {
  const s = styles[role] ?? styles.viewer;
  return (
    <span
      className="inline-block whitespace-nowrap rounded-md px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}
