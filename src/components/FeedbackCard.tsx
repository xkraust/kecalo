interface FeedbackCardProps {
  up: number;
  down: number;
}

// Míra spokojenosti (% kladných) + poměrový pruh. Nahrazuje emoji palce v dashboardu.
// Vnější styl mirroruje StatCard, aby karta seděla do řady metrik.
export function FeedbackCard({ up, down }: FeedbackCardProps) {
  const total = up + down;
  const pct = total === 0 ? 0 : Math.round((up / total) * 100);

  return (
    <div className="rounded-lg bg-secondary p-4">
      <p className="text-[13px] text-muted-foreground mb-1.5">Spokojenost</p>
      {total === 0 ? (
        <p className="text-2xl font-medium text-muted-foreground">—</p>
      ) : (
        <div className="space-y-2.5">
          <p className="text-2xl font-medium">{pct}&nbsp;%</p>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-background">
            <div style={{ width: `${pct}%`, backgroundColor: "#1D9E75" }} />
            <div style={{ width: `${100 - pct}%`, backgroundColor: "#E24B4A" }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {up} kladných · {down} záporných
          </p>
        </div>
      )}
    </div>
  );
}
