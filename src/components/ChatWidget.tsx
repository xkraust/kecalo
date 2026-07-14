"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, Minus, RotateCcw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChatMessages } from "@/components/ChatMessages";
import { useKecaloChat } from "@/lib/use-kecalo-chat";

const WIDGET_EMPTY_DESCRIPTION =
  "Zeptejte se na pojistné podmínky. Odpovídáme z dokumentů a vždy uvádíme zdroj.";

// Musí odpovídat délce transition panelu (viz duration-200 níže) — fokus
// inputu se spustí až po dokončení animace, kdy panel už není `inert`.
const OPEN_TRANSITION_MS = 210;

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const {
    messages,
    input,
    setInput,
    isLoading,
    feedbackMap,
    sessionId,
    scrollRef,
    sendMessage,
    handleInputKeyDown,
    handleFeedback,
    handleNewConversation,
  } = useKecaloChat();
  const inputRef = useRef<HTMLInputElement>(null);

  // Fokus vstupu po otevření — až po odeznění animace, protože během `inert`
  // panelu nejde prvek fokusovat.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), OPEN_TRANSITION_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Escape minimalizuje otevřený panel (stream se neabortuje — jen se schová).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {/* Panel je vždy namountovaný — stav, rozepsaný vstup i běžící stream
          přežijí minimalizaci. Skrývání je čistě CSS + inert/aria-hidden. */}
      <div
        role="dialog"
        aria-label="Chat — Pojišťovna Jistota"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          // max-h rezervuje místo i pro bublinu pod panelem (56px) + mezeru
          // (12px) + spodní okraj (16px) ≈ 6rem, jinak se na nízkých oknech
          // uřízne horní hlavička nad viewportem.
          "flex h-[600px] w-[380px] max-h-[calc(100dvh-6rem)] max-w-[calc(100vw-2rem)] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl transition-all duration-200",
          open
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-2 scale-95 opacity-0"
        )}
      >
        <header className="flex shrink-0 items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary-foreground/15 text-sm font-medium">
              J
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium">Pojišťovna Jistota</span>
              <span className="text-xs text-primary-foreground/80">
                Virtuální asistent
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleNewConversation}
              aria-label="Nová konverzace"
              className="rounded-md p-1.5 transition-colors hover:bg-primary-foreground/15"
            >
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Minimalizovat chat"
              className="rounded-md p-1.5 transition-colors hover:bg-primary-foreground/15"
            >
              <Minus size={16} />
            </button>
          </div>
        </header>

        <ChatMessages
          compact
          emptyStateDescription={WIDGET_EMPTY_DESCRIPTION}
          messages={messages}
          isLoading={isLoading}
          feedbackMap={feedbackMap}
          onFeedback={handleFeedback}
          sendMessage={sendMessage}
          sessionId={sessionId}
          scrollRef={scrollRef}
        />

        <div className="shrink-0 border-t border-border bg-background">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Napište svůj dotaz…"
              disabled={isLoading}
              className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            />
            <Button
              type="button"
              size="icon"
              disabled={isLoading || !input.trim()}
              onClick={() => sendMessage(input)}
            >
              <Send size={16} />
            </Button>
          </div>
          <p className="px-3 pb-2 text-center text-[10px] text-muted-foreground">
            Odpovědi generuje AI z dostupných dokumentů.
          </p>
        </div>
      </div>

      {/* Plovoucí bublina — přepíná panel; zůstává viditelná i při otevřeném
          okně (běžný pattern webchatu). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Minimalizovat chat" : "Otevřít chat"}
        aria-expanded={open}
        className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
      >
        <MessageCircle size={24} />
      </button>
    </div>
  );
}
