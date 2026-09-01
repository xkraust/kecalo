import Link from "next/link";
import { ShieldCheck, ShieldOff } from "lucide-react";

/**
 * Stav konfigurace SSO (etapa D plánu rolí). Zobrazuje se jen aplikační roli
 * admin — nikdo jiný s konfigurací nic neudělá a jen by ho to mátlo.
 *
 * Varianta `compact` je pro patičku sidebaru, plná pro stránku Uživatelé.
 */
export function SsoStatus({
  enabled,
  missing,
  compact = false,
}: {
  enabled: boolean;
  missing: string[];
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div
        className="flex items-center gap-1.5 px-3 pb-2 text-xs text-sidebar-foreground/70"
        title={
          enabled
            ? "Přihlášení firemním účtem je nastavené"
            : `Přihlášení firemním účtem není nastavené${
                missing.length ? ` — chybí ${missing.join(", ")}` : ""
              }`
        }
      >
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: enabled ? "#0F6E56" : "#B4B2AA" }}
        />
        SSO {enabled ? "aktivní" : "neaktivní"}
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-2.5 rounded-lg border border-border px-4 py-3 text-sm"
      style={{ backgroundColor: enabled ? "#E1F5EE" : "#F1EFE8" }}
    >
      {enabled ? (
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#0F6E56]" />
      ) : (
        <ShieldOff size={18} className="mt-0.5 shrink-0 text-[#5F5E5A]" />
      )}
      <div className="min-w-0">
        <p
          className="font-medium"
          style={{ color: enabled ? "#0F6E56" : "#5F5E5A" }}
        >
          Přihlášení firemním účtem (SSO):{" "}
          {enabled ? "aktivní" : "neaktivní"}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {enabled ? (
            <>
              Na přihlašovací stránce se nabízí tlačítko &bdquo;Přihlásit přes
              firemní účet&ldquo;. Uživatelé vznikají automaticky při prvním
              přihlášení s rolí
              Čtenář; pracovní role se přidělují podle skupin v IdP.
            </>
          ) : missing.length > 0 ? (
            <>
              Chybí proměnné prostředí:{" "}
              <code className="font-mono text-xs">{missing.join(", ")}</code>.
              Po jejich doplnění je nutný redeploy.
            </>
          ) : (
            <>Konfigurace není nastavená.</>
          )}{" "}
          <Link
            href="https://github.com/xkraust/kecalo/blob/main/docs/sso-setup.md"
            className="font-medium underline"
            target="_blank"
          >
            Návod na zapnutí
          </Link>
        </p>
      </div>
    </div>
  );
}
