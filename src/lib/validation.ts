// Sdílené validace vstupů (bez server-only importů — použitelné i z klienta).

/**
 * Záměrně volný tvar: „něco @ něco . něco" bez mezer. Přísnější regulární
 * výraz nic nezískává — jediné skutečné ověření adresy je poslat na ni zprávu,
 * což aplikace neumí. Cílem je zachytit překlep, ne vyhovět RFC 5322.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_EMAIL_LENGTH = 120;
export const MAX_NAME_LENGTH = 80;

export function isValidEmail(value: string): boolean {
  return value.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(value);
}

/** Jméno nebo příjmení: neprázdné a v mezích CHECK z migrace 018. */
export function isValidPersonName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_NAME_LENGTH;
}

/** Celé jméno pro zobrazení; při chybějících údajích padá na e-mail. */
export function fullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback: string
): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || fallback;
}
