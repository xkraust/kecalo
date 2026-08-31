-- Kecalo — vynucená změna iniciálního hesla (etapa B, docs/plans/roles_and_document_access_plan.md)
-- Uživatele zakládá admin a heslo generuje aplikace; předává se ale mimo systém
-- (Slack, telefon), takže se s ním počítá jako s kompromitovaným od okamžiku
-- odeslání. Dokud je příznak true, uživatel nesmí dělat nic než změnit heslo —
-- vynucuje to requireAppRole() (403 na všech routách kromě změny hesla)
-- i admin layout (redirect na /admin/change-password).
--
-- DEFAULT false je záměrný: existující účty (seed admin) změnu vynucenou nemají.
-- Heslo si zadal ten, kdo aplikaci nasazuje, do vlastního .env — nikdo mu ho
-- neposílal. Příznak nastavuje jen založení uživatele adminem a reset hesla.

alter table users
  add column if not exists must_change_password boolean not null default false;
