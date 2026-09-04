import { Globe, Building2, AlertTriangle } from "lucide-react";

/**
 * Provozní režim instance — **odvozený**, ne uložený (GDPR etapa G).
 *
 * Jeden boolean „veřejná / interní" v `app_settings` by se rozvětvil do desítek
 * podmínek, zdvojnásobil matici testování a hlavně by GDPR-relevantní chování
 * měnil jedním kliknutím v adminu. Odvozený stav naopak nemůže zastarat a nemá
 * vlastní zdroj pravdy: kdykoli ukazuje to, co skutečně platí.
 *
 * Kromě samotného režimu hlásí i **nesourodé kombinace** — konfigurace, které
 * jednotlivě projdou, ale dohromady nedávají smysl. Právě ty se hledají nejhůř,
 * protože nic nespadne.
 */
export interface DeploymentModeInput {
  /** Env `PUBLIC_CHAT` — smí se ptát anonym? */
  publicChat: boolean;
  /** `app_settings.default_document_visibility` */
  defaultDocumentVisibility: "public" | "restricted";
  /** `app_settings.lead_capture_enabled` */
  leadCaptureEnabled: boolean;
}

/** Nesourodé kombinace, na které je potřeba upozornit. */
export function deploymentWarnings(input: DeploymentModeInput): string[] {
  const warnings: string[] = [];

  if (input.publicChat && input.defaultDocumentVisibility === "restricted") {
    warnings.push(
      "Chat je otevřený anonymním návštěvníkům, ale nově nahrané dokumenty jsou ve výchozím stavu omezené — veřejný bot je neuvidí a bude na dotazy odpovídat fallbackem, dokud jim někdo nepřidělí štítky."
    );
  }

  if (!input.publicChat && input.leadCaptureEnabled) {
    warnings.push(
      "Instance je interní (chat vyžaduje přihlášení), ale sběr kontaktů je zapnutý. Bot bude po přihlášených zaměstnancích chtít kontaktní údaje pod hlavičkou souhlasu — v zaměstnaneckém vztahu je souhlas problematický právní titul a údaje stejně už máte."
    );
  }

  return warnings;
}

export function DeploymentMode({
  input,
  compact = false,
}: {
  input: DeploymentModeInput;
  compact?: boolean;
}) {
  const isPublic = input.publicChat;
  const label = isPublic ? "Veřejná instance" : "Interní instance";
  const warnings = deploymentWarnings(input);

  if (compact) {
    return (
      <div
        className="flex items-center gap-1.5 px-3 pb-2 text-xs text-sidebar-foreground/70"
        title={
          isPublic
            ? "Chat je přístupný bez přihlášení (PUBLIC_CHAT=true)"
            : "Chat vyžaduje přihlášení (PUBLIC_CHAT není zapnuté)"
        }
      >
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{
            backgroundColor: warnings.length
              ? "#854F0B"
              : isPublic
                ? "#0F6E56"
                : "#5F5E5A",
          }}
        />
        {label}
        {warnings.length > 0 && " · pozor"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="flex items-start gap-2.5 rounded-lg border border-border px-4 py-3 text-sm"
        style={{ backgroundColor: isPublic ? "#E1F5EE" : "#F1EFE8" }}
      >
        {isPublic ? (
          <Globe size={18} className="mt-0.5 shrink-0 text-[#0F6E56]" />
        ) : (
          <Building2 size={18} className="mt-0.5 shrink-0 text-[#5F5E5A]" />
        )}
        <div className="min-w-0">
          <p
            className="font-medium"
            style={{ color: isPublic ? "#0F6E56" : "#5F5E5A" }}
          >
            {label}
          </p>
          <p className="text-muted-foreground mt-0.5">
            {isPublic
              ? "Chat, hodnocení i odeslání poptávky jsou přístupné bez přihlášení."
              : "Chat i obě chatové stránky vyžadují přihlášení."}{" "}
            Řídí se proměnnou prostředí <code>PUBLIC_CHAT</code>, ne nastavením
            v administraci — je to bezpečnostní hranice, ne preference.
          </p>
          <p className="text-muted-foreground mt-1.5 text-xs">
            Výchozí viditelnost dokumentů:{" "}
            <strong>
              {input.defaultDocumentVisibility === "public"
                ? "veřejné"
                : "omezené"}
            </strong>{" "}
            · sběr kontaktů:{" "}
            <strong>{input.leadCaptureEnabled ? "zapnutý" : "vypnutý"}</strong>
          </p>
        </div>
      </div>

      {warnings.map((w) => (
        <div
          key={w}
          className="flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: "#FAEEDA", color: "#854F0B" }}
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>{w}</p>
        </div>
      ))}
    </div>
  );
}
