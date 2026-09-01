"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SSO_ERRORS: Record<string, string> = {
  sso_disabled: "Přihlášení přes firemní účet není nastavené.",
  sso_unavailable: "Firemní přihlášení je dočasně nedostupné. Zkuste to za chvíli.",
  sso_state: "Přihlášení vypršelo nebo bylo přerušeno. Zkuste to prosím znovu.",
  sso_claims: "Od firemního účtu nedorazily potřebné údaje.",
  sso_account: "Účet nejde v Kecalu založit. Obraťte se na správce.",
  sso_failed: "Firemní přihlášení se nezdařilo.",
};

export function LoginForm({
  ssoEnabled,
  ssoError,
}: {
  ssoEnabled: boolean;
  ssoError?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(
    ssoError ? (SSO_ERRORS[ssoError] ?? "Přihlášení se nezdařilo.") : ""
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push("/admin");
      } else {
        const data = await res.json();
        setError(data.error ?? "Přihlášení selhalo");
      }
    } catch {
      setError("Chyba připojení");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-medium mb-2">
            K
          </div>
          <CardTitle className="text-xl">Administrace Kecalo</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              autoComplete="email"
            />
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Heslo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button
              type="submit"
              disabled={loading || !email || !password}
            >
              {loading ? "Přihlašování…" : "Přihlásit se"}
            </Button>
          </form>

          {ssoEnabled && (
            <>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">nebo</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  window.location.href = "/api/auth/oidc/start";
                }}
              >
                <Building2 size={16} /> Přihlásit přes firemní účet
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
