"use client";

import type { RefObject } from "react";
import { cn } from "@/lib/utils";
import { MessageBubble } from "@/components/MessageBubble";
import { SAMPLE_QUESTIONS, type ChatMessage } from "@/lib/use-kecalo-chat";

const DEFAULT_EMPTY_DESCRIPTION =
  "Zeptejte se na cokoliv k pojistným podmínkám. Odpovídáme výhradně z dokumentů a vždy uvádíme zdroj.";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  feedbackMap: Record<number, "up" | "down">;
  onFeedback: (messageIndex: number, rating: "up" | "down") => void;
  sendMessage: (text: string) => void;
  sessionId: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Kompaktní režim pro widget — menší paddingy, prázdný stav pod sebou. */
  compact?: boolean;
  /** Kratší uvítání pro widget; výchozí je plný text fullscreen chatu. */
  emptyStateDescription?: string;
}

export function ChatMessages({
  messages,
  isLoading,
  feedbackMap,
  onFeedback,
  sendMessage,
  sessionId,
  scrollRef,
  compact = false,
  emptyStateDescription = DEFAULT_EMPTY_DESCRIPTION,
}: ChatMessagesProps) {
  // min-h-0: flex položka jinak nesmí být menší než obsah (min-height: auto)
  // a overflow-y-auto by se nikdy neaktivoval — scrolloval by celý dokument.
  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
      <div
        className={cn(
          "space-y-4",
          compact ? "px-3 py-4" : "mx-auto max-w-2xl px-4 py-6"
        )}
      >
        {messages.length === 0 ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center text-center",
              compact ? "gap-4 pt-8" : "gap-6 pt-16"
            )}
          >
            <div className="flex flex-col items-center gap-3">
              <div
                className={cn(
                  "flex items-center justify-center rounded-xl bg-primary text-primary-foreground font-medium",
                  compact ? "size-10 text-lg" : "size-12 text-xl"
                )}
              >
                J
              </div>
              {compact ? (
                <h2 className="text-lg font-medium">Pojišťovna Jistota</h2>
              ) : (
                <h1 className="text-2xl font-medium">Pojišťovna Jistota</h1>
              )}
              <p
                className={cn(
                  "text-muted-foreground",
                  compact ? "text-sm" : "max-w-md"
                )}
              >
                {emptyStateDescription}
              </p>
            </div>
            <div
              className={cn(
                "gap-2",
                compact
                  ? "flex flex-col self-stretch"
                  : "flex flex-wrap justify-center"
              )}
            >
              {SAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className={cn(
                    "rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground hover:bg-secondary transition-colors",
                    compact && "text-left"
                  )}
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
              onFeedback={onFeedback}
              showLeadForm={m.offerLead}
              sessionId={sessionId}
              conversation={messages
                .slice(0, i + 1)
                .slice(-8)
                .map(({ role, content }) => ({ role, content }))}
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
  );
}
