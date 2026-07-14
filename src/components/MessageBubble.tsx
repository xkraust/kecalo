"use client";

import ReactMarkdown from "react-markdown";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { SourcesBlock, type Source } from "./SourcesBlock";
import { LeadForm, type ConversationMessage } from "./LeadForm";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  messageIndex?: number;
  feedbackRating?: "up" | "down" | null;
  onFeedback?: (messageIndex: number, rating: "up" | "down") => void;
  /** Nabídka kontaktu — model odpověď označil tokenem [[NABIDKA]]. */
  showLeadForm?: boolean;
  sessionId?: string;
  /** Posledních max 8 zpráv konverzace pro serverovou komprimaci poptávky. */
  conversation?: ConversationMessage[];
}

export function MessageBubble({
  role,
  content,
  sources,
  messageIndex,
  feedbackRating,
  onFeedback,
  showLeadForm,
  sessionId,
  conversation,
}: MessageBubbleProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground text-sm">
          {content}
        </div>
      </div>
    );
  }

  // Prázdná asistentská zpráva (těsně po odeslání, než dorazí první token)
  // se nevykresluje — „píšící" tečky v ChatMessages ji reprezentují, jinak
  // by se zobrazila prázdná bublina zároveň s tečkami.
  if (!content) return null;

  const showFeedback =
    content.length > 0 && messageIndex !== undefined && onFeedback;

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%]">
        <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-2.5 text-sm">
          <div className="prose prose-sm max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
        {sources && sources.length > 0 && (
          <div className="px-1">
            <SourcesBlock sources={sources} />
          </div>
        )}
        {showLeadForm && sessionId && (
          <LeadForm sessionId={sessionId} conversation={conversation ?? []} />
        )}
        {showFeedback && (
          <div className="mt-1.5 flex items-center gap-1 px-1">
            <button
              type="button"
              aria-label="Palec nahoru"
              onClick={() => onFeedback(messageIndex, "up")}
              className={`rounded-md p-1 transition-colors ${
                feedbackRating === "up"
                  ? "text-primary"
                  : "text-muted-foreground/50 hover:text-foreground"
              }`}
            >
              <ThumbsUp size={14} />
            </button>
            <button
              type="button"
              aria-label="Palec dolů"
              onClick={() => onFeedback(messageIndex, "down")}
              className={`rounded-md p-1 transition-colors ${
                feedbackRating === "down"
                  ? "text-primary"
                  : "text-muted-foreground/50 hover:text-foreground"
              }`}
            >
              <ThumbsDown size={14} />
            </button>
            {feedbackRating === "up" && (
              <span className="text-xs text-muted-foreground">
                Děkujeme za zpětnou vazbu, jsme rádi, že odpověď pomohla.
              </span>
            )}
            {feedbackRating === "down" && showLeadForm && (
              <span className="text-xs text-muted-foreground">
                Děkujeme za zpětnou vazbu.
              </span>
            )}
          </div>
        )}
        {/* Palec dolů → nabídka kontaktu (lead typu hodnoceni). Když je nad
            tlačítky už produktový formulář, druhý se nevykresluje — kontakt
            sbírá ten produktový, hlas se do /api/feedback uloží tak jako tak. */}
        {feedbackRating === "down" && sessionId && !showLeadForm && (
          <LeadForm
            variant="hodnoceni"
            sessionId={sessionId}
            conversation={conversation ?? []}
          />
        )}
      </div>
    </div>
  );
}
