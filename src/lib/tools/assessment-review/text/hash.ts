/**
 * A stable hash of a string.
 *
 * The export uses it to say that two items carry the same text without
 * printing the text twice, and to group rubrics whose content is the same.
 * It is not a security hash — it only has to be stable across runs.
 */

/**
 * Hash a string to a short hex token.
 *
 * Two 32-bit accumulators are mixed, which keeps the chance of two different
 * texts landing on the same token very small.
 */
export function hashString(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(12, "0");
}

/** The hash of a text, used as the id of a stored text. */
export function textId(prefix: string, value: string): string {
  return `${prefix}-${hashString(value)}`;
}
