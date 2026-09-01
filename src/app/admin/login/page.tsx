// Server část loginu — zjistí, jestli je SSO nastavené (env je server-only).
import { isOidcEnabled } from "@/lib/auth/oidc";
import { LoginForm } from "./client";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm ssoEnabled={isOidcEnabled()} ssoError={error} />;
}
