"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+ 0-9-]{9,20}$/;
const MAX_NOTE_LENGTH = 500;

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface LeadFormProps {
  sessionId: string;
  /** Posledních max 8 zpráv konverzace — jen pro serverovou komprimaci. */
  conversation: ConversationMessage[];
}

type FormState = "idle" | "sending" | "done";

export function LeadForm({ sessionId, conversation }: LeadFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") {
    return (
      <div className="mt-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        Děkujeme, ozveme se co nejdříve.
      </div>
    );
  }

  const validate = (): string | null => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return "Vyplňte prosím jméno a příjmení (2–100 znaků).";
    }
    const hasEmail = email.trim().length > 0;
    const hasPhone = phone.trim().length > 0;
    if (!hasEmail && !hasPhone) {
      return "Vyplňte alespoň jeden kontakt — e-mail nebo telefon.";
    }
    if (hasEmail && !EMAIL_REGEX.test(email.trim())) {
      return "E-mail nemá platný formát.";
    }
    if (hasPhone && !PHONE_REGEX.test(phone.trim())) {
      return "Telefon nemá platný formát (9–20 znaků, číslice a předvolba).";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setState("sending");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          note: note.trim() || undefined,
          consent,
          sessionId,
          messages: conversation,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error ?? "Odeslání se nepodařilo. Zkuste to prosím za chvíli."
        );
      }
      setState("done");
    } catch (err) {
      setState("idle");
      setError(
        err instanceof Error
          ? err.message
          : "Odeslání se nepodařilo. Zkuste to prosím za chvíli."
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 rounded-lg border border-border bg-card px-4 py-3.5 space-y-2.5"
    >
      <p className="text-sm font-medium">
        Chcete podmínky šité na míru? Zanechte kontakt a ozveme se.
      </p>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Jméno a příjmení"
        maxLength={100}
        disabled={state === "sending"}
        aria-label="Jméno a příjmení"
      />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          maxLength={120}
          disabled={state === "sending"}
          aria-label="E-mail"
        />
        <Input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Telefon"
          maxLength={20}
          disabled={state === "sending"}
          aria-label="Telefon"
        />
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Poznámka (nepovinné)"
        maxLength={MAX_NOTE_LENGTH}
        rows={2}
        disabled={state === "sending"}
        aria-label="Poznámka"
      />

      <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={state === "sending"}
          className="mt-0.5 accent-primary"
        />
        <span>
          Souhlasím se zpracováním osobních údajů za účelem kontaktování.
        </span>
      </label>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button
        type="submit"
        size="sm"
        disabled={!consent || state === "sending"}
      >
        {state === "sending" ? "Odesílám…" : "Odeslat poptávku"}
      </Button>
    </form>
  );
}
