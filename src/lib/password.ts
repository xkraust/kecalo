// Hashování hesel lokálních účtů (etapa A plánu rolí).
// scrypt z node:crypto — žádná nová závislost, běží na Vercelu i lokálně.
// Formát: scrypt$N$r$p$<salt-hex>$<hash-hex>; parametry jsou uložené v hashi,
// takže je lze v budoucnu zvýšit, aniž by se znehodnotila existující hesla.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// N=16384, r=8, p=1 — doporučené minimum; ~100 ms na běžném CPU.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// Vlastní wrapper místo promisify: promisify si u scryptu vybere overload
// bez options a parametry N/r/p by nešlo předat.
function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: n, r, p, maxmem: 128 * n * r * 2 },
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Ověří heslo proti uloženému hashi. Vrací false i při poškozeném formátu —
 * nikdy nevyhazuje, aby login neselhal 500 kvůli jednomu vadnému řádku v DB.
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const n = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
      return false;
    }
    // Strop proti DoS z podvrženého hashe s obřím N (128*N*r bajtů paměti).
    if (n <= 0 || n > 1 << 20 || r <= 0 || r > 32 || p <= 0 || p > 16) {
      return false;
    }

    const salt = Buffer.from(parts[4], "hex");
    const expected = Buffer.from(parts[5], "hex");
    if (salt.length === 0 || expected.length === 0) return false;

    const actual = await derive(password, salt, n, r, p);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Spálí srovnatelný čas jako ověření hesla, když uživatel neexistuje nebo je
 * neaktivní — login pak neprozradí existenci účtu rozdílnou latencí
 * (invariant 9 v plánu rolí). Výsledek se zahazuje.
 */
const DUMMY_SALT = Buffer.alloc(SALT_LENGTH, 0x2a);

export async function burnPasswordTime(password: string): Promise<void> {
  await derive(password, DUMMY_SALT, N, R, P);
}
