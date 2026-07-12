// ID generation for drawbridge-outcomes/1.
//
// IDs are opaque, short, and immutable after creation: a type prefix (co_/eo_/lo_)
// plus a 4-char base36 body. They are random, NOT derived from content or order —
// display numbering derives from order, IDs never do (docs/formats/outcomes-format.md).
//
// Framework-free. No Svelte, no DOM, no Astro.

export type IdPrefix = "co" | "eo" | "lo";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomBody(len: number, rng: () => number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return s;
}

/**
 * Mint a new unique id with the given prefix, avoiding anything in `taken`.
 * `rng` is injectable for deterministic tests; defaults to Math.random.
 */
export function newId(
  prefix: IdPrefix,
  taken: Iterable<string>,
  rng: () => number = Math.random,
): string {
  const set = taken instanceof Set ? taken : new Set(taken);
  // 4 base36 chars = ~1.6M combinations; collisions are rare but handled.
  for (let attempt = 0; attempt < 1000; attempt++) {
    const id = `${prefix}_${randomBody(4, rng)}`;
    if (!set.has(id)) return id;
  }
  // Astronomically unlikely to reach here; widen the body rather than throw.
  let id: string;
  do {
    id = `${prefix}_${randomBody(8, rng)}`;
  } while (set.has(id));
  return id;
}
