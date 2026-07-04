"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Send, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "@/components/MessageBubble";
import type { Source } from "@/components/SourcesBlock";

const SAMPLE_QUESTIONS = [
  "Co kryje pojištění majetku?",
  "Jaké jsou výluky z pojištění?",
  "Co je spoluúčast a jak funguje?",
  "Jak nahlásit pojistnou událost?",
];

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

let nextId = 0;

function getSessionId(): string {
  const key = "kecalo_session_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState<
    Record<number, "up" | "down">
  >({});
  const scrollRef = useRef<HTMLDivElement>(null);
  // Běžící stream se dá zrušit (nová konverzace, unmount) — oprava E3.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const [sessionId, setSessionId] = useState(() => {
    if (typeof window === "undefined") return "";
    return getSessionId();
  });

  // Okamžitý (ne smooth) scroll vnitřního kontejneru: effect běží při každém
  // kousku streamu a restartovaná smooth animace způsobovala trhání.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: `msg-${nextId++}`,
        role: "user",
        content: text.trim(),
      };

      const assistantId = `msg-${nextId++}`;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
      };

      const updatedMessages = [...messages, userMsg];
      setMessages([...updatedMessages, assistantMsg]);
      setInput("");
      setIsLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: controller.signal,
        });

        let sources: Source[] = [];
        const sourcesHeader = res.headers.get("X-Sources");
        if (sourcesHeader) {
          try {
            sources = JSON.parse(decodeURIComponent(sourcesHeader));
          } catch {
            /* ignore */
          }
        }

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null);
          const errText =
            data?.error ??
            "Omlouváme se, služba je dočasně nedostupná. Zkuste to prosím za chvíli.";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: errText } : m
            )
          );
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          accumulated += decoder.decode(value, { stream: true });
          const current = accumulated;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: current, sources } : m
            )
          );
        }

        // Flush dekodéru — poslední vícebajtový znak mohl zůstat rozdělený.
        accumulated += decoder.decode();
        const final = accumulated;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: final, sources } : m
          )
        );
      } catch (err) {
        // Zrušený request (nová konverzace, unmount) není výpadek služby.
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    "Omlouváme se, služba je dočasně nedostupná. Zkuste to prosím za chvíli.",
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [sendMessage, input]
  );

  const handleFeedback = useCallback(
    (messageIndex: number, rating: "up" | "down") => {
      if (feedbackMap[messageIndex] === rating) return;
      setFeedbackMap((prev) => ({ ...prev, [messageIndex]: rating }));

      // Dotaz patřící hodnocené odpovědi je zpráva těsně před ní — ne poslední
      // dotaz celé konverzace (oprava E3).
      const prevMessage = messages[messageIndex - 1];
      const userQuery =
        prevMessage?.role === "user" ? prevMessage.content : undefined;

      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          messageIndex,
          rating,
          query: userQuery,
        }),
      }).catch(() => {});
    },
    [feedbackMap, messages, sessionId]
  );

  const handleNewConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setFeedbackMap({});
    const newId = crypto.randomUUID();
    localStorage.setItem("kecalo_session_id", newId);
    setSessionId(newId);
  }, []);

  return (
    // h-dvh ukotví chat na výšku viewportu — scrolluje vnitřní panel zpráv,
    // ne dokument (body má jen min-h-full), takže spodní lišta stojí na místě.
    // min-h-0 je nutné: jako flex položka body (flex-col) by jinak min-height:auto
    // roztáhl kořen na výšku obsahu a h-dvh by se neuplatnilo.
    <div className="flex h-dvh min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium">
            J
          </div>
          <span className="text-[15px] font-medium">Pojišťovna Jistota</span>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewConversation}
            className="gap-1.5 text-muted-foreground"
          >
            <RotateCcw size={14} />
            Nová konverzace
          </Button>
        )}
      </header>

      {/* min-h-0: flex položka jinak nesmí být menší než obsah (min-height: auto)
          a overflow-y-auto by se nikdy neaktivoval — scrolloval by celý dokument. */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-6 pt-16 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-xl font-medium">
                  J
                </div>
                <h1 className="text-2xl font-medium">Pojišťovna Jistota</h1>
                <p className="max-w-md text-muted-foreground">
                  Zeptejte se na cokoliv k pojistným podmínkám. Odpovídáme
                  výhradně z dokumentů a vždy uvádíme zdroj.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground hover:bg-secondary transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                role={m.role}
                content={m.content}
                sources={m.sources}
                messageIndex={i}
                feedbackRating={feedbackMap[i] ?? null}
                onFeedback={handleFeedback}
              />
            ))
          )}

          {isLoading &&
            messages.length > 0 &&
            messages[messages.length - 1].content === "" && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3">
                  <div className="flex gap-1">
                    <span className="size-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                    <span className="size-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                    <span className="size-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
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
        <p className="text-center text-[11px] text-muted-foreground pb-2 px-4">
          Odpovědi jsou generovány na základě dostupných dokumentů. Pro závazné
          informace kontaktujte pojišťovnu.
        </p>
      </div>
    </div>
  );
}
