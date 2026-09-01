"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MIN_LENGTH = 12;

export function ChangePasswordForm({
  displayName,
  forced,
}: {
  displayName: string;
  forced: boolean;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== repeat) {
      setError("Nová hesla se neshodují.");
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      setError(`Nové heslo musí mít aspoň ${MIN_LENGTH} znaků.`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Změna hesla selhala.");
      }
    } catch {
      setError("Chyba připojení");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground">
            K
          </div>
          <CardTitle className="text-xl">Změna hesla</CardTitle>
          <p className="text-sm text-muted-foreground">{displayName}</p>
        </CardHeader>
        <CardContent>
          {forced && (
            <p className="mb-4 rounded-md bg-[#FAEEDA] px-3 py-2 text-sm text-[#854F0B]">
              Přihlásili jste se heslem, které vám nastavil správce. Než budete
              pokračovat, zvolte si prosím vlastní.
            </p>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              type={show ? "text" : "password"}
              placeholder="Stávající heslo"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                placeholder={`Nové heslo (min. ${MIN_LENGTH} znaků)`}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label={show ? "Skrýt hesla" : "Zobrazit hesla"}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <Input
              type={show ? "text" : "password"}
              placeholder="Nové heslo znovu"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              autoComplete="new-password"
              required
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "Ukládám…" : "Změnit heslo"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
