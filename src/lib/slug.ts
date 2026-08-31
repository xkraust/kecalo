// Odvození technického kódu z českého názvu (etapa C plánu rolí).
// Štítky a pracovní role se udržují česky s diakritikou — kód je jen technická
// vodoznak pro URL, SQL a primární klíč, takže ho negeneruje uživatel.
//
// Proč kód zůstává ASCII: „č" jde v Unicode zapsat dvěma způsoby (NFC jedním
// znakem, NFD jako `c` + kombinující háček). Vizuálně shodné, bajtově různé —
// a protože je kód primární klíč, vznikly by dva štítky vypadající identicky.

/** Musí odpovídat CHECK v 016_job_roles_audiences.sql. */
export const CODE_PATTERN = /^[a-z0-9_-]{2,32}$/;
const MAX_CODE_LENGTH = 32;

/**
 * „Právní oddělení" → `pravni-oddeleni`.
 *
 * NFD rozloží písmeno s diakritikou na základ + kombinující znak (rozsah
 * U+0300–U+036F), ten se pak zahodí — proto to funguje i pro znaky, které by
 * žádná ručně psaná tabulka náhrad nepokryla.
 */
export function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_CODE_LENGTH)
    .replace(/-+$/g, "");
}

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}
