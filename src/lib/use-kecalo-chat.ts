"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { Source } from "@/components/SourcesBlock";

export const SAMPLE_QUESTIONS = [
  "Jaké pojištění bytového domu si mohu sjednat?",
  "Do kdy můžu vypovědět smlouvu po jejím uzavření?",
  "Nabízíte i životní nebo cestovní pojištění?",
  "Za jak dlouho po škodě vyplatíte pojistné plnění?",
];

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  /** Model odpověď označil tokenem [[NABIDKA]] → zobrazit kartu poptávky. */
  offerLead?: boolean;
}

/** Skrytá značka od modelu — jen u dotazů na konkrétní pojistný produkt. */
const LEAD_TOKEN = "[[NABIDKA]]";

/**
 * Odstraní token nabídky z textu pro zobrazení i historii. Pracuje vždy nad
 * celým akumulovaným textem (token může přijít rozdělený mezi chunky streamu)
 * a ořezává i neúplný prefix tokenu na konci ("[[", "[[NAB"…), aby během
 * streamování neprobliknul v bublině, než dorazí zbytek.
 */
function stripLeadToken(text: string): {
  content: string;
  offerLead: boolean;
} {
  const offerLead = text.includes(LEAD_TOKEN);
  let content = offerLead ? text.replaceAll(LEAD_TOKEN, "") : text;
  for (
    let len = Math.min(LEAD_TOKEN.length - 1, content.length);
    len > 0;
    len--
  ) {
    if (content.endsWith(LEAD_TOKEN.slice(0, len))) {
      content = content.slice(0, content.length - len);
      break;
    }
  }
  return { content: content.trimEnd(), offerLead };
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

export function useKecaloChat() {
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
          // Token nabídky se odstraňuje už při ukládání do state — do /api/chat
          // se tak historie posílá bez něj.
          const current = stripLeadToken(accumulated);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: current.content,
                    sources,
                    offerLead: current.offerLead,
                  }
                : m
            )
          );
        }

        // Flush dekodéru — poslední vícebajtový znak mohl zůstat rozdělený.
        accumulated += decoder.decode();
        const final = stripLeadToken(accumulated);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: final.content,
                  sources,
                  offerLead: final.offerLead,
                }
              : m
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

  const handleInputKeyDown = useCallback(
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

  return {
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
  };
}
