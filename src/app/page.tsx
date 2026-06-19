import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-xl font-medium">
          J
        </div>
        <h1 className="text-2xl font-medium">Pojišťovna Jistota</h1>
        <p className="max-w-md text-muted-foreground">
          Zeptejte se na cokoliv k pojistným podmínkám. Odpovídáme výhradně
          z dokumentů a vždy uvádíme zdroj.
        </p>
      </div>
      <Button>Začít konverzaci</Button>
      <p className="text-sm text-muted-foreground">
        Rozpracováno — kompletní chat přijde ve fázi 5.
      </p>
    </main>
  );
}
