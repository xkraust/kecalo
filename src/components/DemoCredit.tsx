/**
 * Nenápadný kredit autora dema — sdílený mezi fullscreen chatem (`/`)
 * a demo stránkou (`/demo`), aby text i odkaz měly jediný zdroj pravdy.
 */
export function DemoCredit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11px] text-muted-foreground/70 ${className}`}>
      Technologické demo od{" "}
      <a
        href="https://kraus-ai.cz"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Kraus AI (kraus-ai.cz)
      </a>{" "}
      – konzultace a vývoj AI systémů na míru.
    </p>
  );
}
