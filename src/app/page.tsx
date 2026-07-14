"use client";

import { Send, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessages } from "@/components/ChatMessages";
import { useKecaloChat } from "@/lib/use-kecalo-chat";

export default function ChatPage() {
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

      <ChatMessages
        messages={messages}
        isLoading={isLoading}
        feedbackMap={feedbackMap}
        onFeedback={handleFeedback}
        sendMessage={sendMessage}
        sessionId={sessionId}
        scrollRef={scrollRef}
      />

      <div className="shrink-0 border-t border-border bg-background">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <input
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
        <p className="text-center text-[11px] text-muted-foreground pb-2 px-4">
          Odpovědi jsou generovány na základě dostupných dokumentů. Pro závazné
          informace kontaktujte pojišťovnu.
        </p>
      </div>
    </div>
  );
}
