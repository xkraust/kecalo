import type { Metadata } from "next";
import { ShieldCheck, Building2, Umbrella, Phone } from "lucide-react";
import { ChatWidget } from "@/components/ChatWidget";

export const metadata: Metadata = {
  title: "Pojišťovna Jistota — pojištění bez starostí",
};

const PRODUCTS = [
  {
    icon: ShieldCheck,
    title: "Pojištění majetku",
    text: "Ochrana domácnosti i nemovitosti proti požáru, vodě, vichřici i krádeži.",
  },
  {
    icon: Building2,
    title: "Bytové domy",
    text: "Komplexní pojištění společných prostor a konstrukce bytových domů.",
  },
  {
    icon: Umbrella,
    title: "Odpovědnost",
    text: "Krytí škod, které nechtěně způsobíte druhým v běžném životě.",
  },
];

export default function DemoPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Hlavička webu (nefunkční nav — jde o statické demo) */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium">
              J
            </div>
            <span className="text-[15px] font-medium">Pojišťovna Jistota</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            <span className="cursor-default hover:text-foreground">Produkty</span>
            <span className="cursor-default hover:text-foreground">Pojistné události</span>
            <span className="cursor-default hover:text-foreground">Kontakt</span>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="mx-auto max-w-2xl text-4xl font-medium leading-tight sm:text-5xl">
          Pojištění, na které se můžete spolehnout
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Chráníme váš domov, majetek i klid v duši. Máte dotaz k pojistným
          podmínkám? Náš virtuální asistent je vám k dispozici.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <span className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
            Sjednat pojištění
          </span>
          <span className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium">
            Prohlédnout produkty
          </span>
        </div>
      </section>

      {/* Produktové karty */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid gap-5 sm:grid-cols-3">
          {PRODUCTS.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-card p-6"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                <Icon size={20} />
              </div>
              <h2 className="mt-4 text-lg font-medium">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Patička */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>© 2026 Pojišťovna Jistota — demo</span>
          <span className="flex items-center gap-1.5">
            <Phone size={14} />
            Infolinka 800 123 456
          </span>
        </div>
      </footer>

      {/* Chat widget — client ostrov */}
      <ChatWidget />
    </div>
  );
}
