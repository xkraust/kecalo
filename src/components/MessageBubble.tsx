"use client";

import ReactMarkdown from "react-markdown";
import { SourcesBlock, type Source } from "./SourcesBlock";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

export function MessageBubble({ role, content, sources }: MessageBubbleProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground text-sm">
          {content}
        </div>
      </div>
    );
  }

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
      </div>
    </div>
  );
}
