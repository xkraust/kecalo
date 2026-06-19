import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-lg bg-secondary p-4">
      <p className="text-[13px] text-muted-foreground mb-1.5">{label}</p>
      <p className="text-2xl font-medium">{value}</p>
    </div>
  );
}
