/**
 * Namespace-agnostic XML helpers.
 *
 * The Canvas cartridge mixes several XML namespaces (IMS Common Cartridge,
 * IMS QTI, Canvas' own `cccv1p0`, LTI) and some files use element prefixes.
 * Matching on local names keeps the parser working across all of them.
 */

/** Parse XML, throwing a labelled error when the document is malformed. */
export function parseXml(source: string, label: string): Document {
  const doc = tryParseXml(repairXml(source, false), label);
  if (doc) return doc;

  // Some Canvas exports are malformed in ways that need more than a tidy-up.
  const repaired = tryParseXml(repairXml(source, true), label);
  if (repaired) return repaired;

  throw new Error(`${label} is not valid XML.`);
}

/** Parse XML, returning `undefined` instead of throwing. */
function tryParseXml(source: string, label: string): Document | undefined {
  const doc = new DOMParser().parseFromString(source, "application/xml");
  const error = doc.getElementsByTagNameNS("*", "parsererror")[0];
  if (error) {
    const detail = (error.textContent ?? "").trim().split("\n")[0];
    void detail;
    void label;
    return undefined;
  }
  return doc;
}

/**
 * True when the source declares a namespace no XML parser will accept.
 *
 * Canvas writes `xmlns:xsi` with two URIs separated by a space in some
 * exports, which is invalid — browsers refuse the whole document.
 */
export function hasBrokenNamespace(source: string): boolean {
  return /\sxmlns:[\w.-]+\s*=\s*"[^"]*\s[^"]*"/.test(source);
}

/**
 * Repair the namespace declarations on the root element.
 *
 * A namespace declaration may only hold one URI, so a declaration with
 * several is cut down to the first. The schema location is only a hint for
 * validation, so it goes entirely — leaving it in place can also break a
 * document whose prefix is not declared.
 *
 * @param aggressive Also drop every namespace declaration and every `xsi:`
 *   attribute. The viewer matches elements by local name, so it does not
 *   need the namespaces, and this rescues files that are broken in ways the
 *   tidy-up above does not cover.
 */
export function repairXml(source: string, aggressive = false): string {
  let start = 0;
  const declaration = /^<\?xml[^?]*\?>/.exec(source);
  if (declaration) start = declaration[0].length;

  const tagEnd = source.indexOf(">", start);
  if (tagEnd === -1) return source;

  const head = source.slice(start, tagEnd);
  let repaired = head.replace(/\sxmlns:([\w.-]+)\s*=\s*"([^"]*\s[^"]*)"/g, (_match, prefix: string, value: string) => {
    const first = value.trim().split(/\s+/)[0];
    return ` xmlns:${prefix}="${first}"`;
  });

  repaired = repaired.replace(/\s+xsi:schemaLocation\s*=\s*"[^"]*"/g, "");

  if (aggressive) {
    repaired = repaired
      .replace(/\s+xmlns:[\w.-]+\s*=\s*"[^"]*"/g, "")
      .replace(/\s+xmlns\s*=\s*"[^"]*"/g, "")
      .replace(/\s+xsi:[\w.-]+\s*=\s*"[^"]*"/g, "");
  }

  return source.slice(0, start) + repaired + source.slice(tagEnd);
}

/** The element a document or element should be searched from. */
function scopeOf(parent: Element | Document): Element | null {
  if ("documentElement" in parent) return parent.documentElement;
  return parent;
}

/**
 * Direct child elements with the given local name.
 *
 * When `parent` is a document, the document element counts as a child — the
 * root of a Canvas settings file is the element being looked for.
 */
export function childElements(parent: Element | Document, localName: string): Element[] {
  if ("documentElement" in parent) {
    const root = parent.documentElement;
    if (!root) return [];
    const matches = root.localName === localName ? [root] : [];
    return [...matches, ...Array.from(root.children).filter((el) => el.localName === localName)];
  }

  return Array.from(parent.children).filter((el) => el.localName === localName);
}

/** Every descendant element with the given local name, in document order. */
export function descendantElements(parent: Element | Document, localName: string): Element[] {
  const scope = scopeOf(parent);
  if (!scope) return [];
  return Array.from(scope.getElementsByTagNameNS("*", localName));
}

/**
 * Every element with the given local name, including the document element.
 *
 * Some of the export's files put the element being looked for at the root —
 * a quiz's settings live in `<quiz>`, for instance.
 */
export function allElements(parent: Element | Document, localName: string): Element[] {
  const scope = scopeOf(parent);
  if (!scope) return [];

  const found = Array.from(scope.getElementsByTagNameNS("*", localName));
  if (scope.localName === localName) found.unshift(scope);
  return found;
}

/** The first direct child with the given local name. */
export function childElement(parent: Element | Document, localName: string): Element | undefined {
  return childElements(parent, localName)[0];
}

/** Trimmed text of the first direct child with the given local name. */
export function childText(parent: Element | Document, localName: string): string {
  return (childElement(parent, localName)?.textContent ?? "").trim();
}

/** Trimmed text of an element. */
export function textOf(element: Element | undefined | null): string {
  return (element?.textContent ?? "").trim();
}

/** An attribute value, trimmed. */
export function attr(element: Element | undefined | null, name: string): string | undefined {
  const value = element?.getAttribute(name);
  return value === null || value === undefined ? undefined : value.trim();
}

/** An attribute read as a boolean. Canvas writes `"true"` / `"false"`. */
export function boolAttr(element: Element | undefined | null, name: string, fallback = false): boolean {
  const value = attr(element, name);
  if (value === undefined || value === "") return fallback;
  return value === "true" || value === "1";
}

/** An attribute read as a number, when it parses. */
export function numberAttr(element: Element | undefined | null, name: string): number | undefined {
  const value = attr(element, name);
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** An element read as a number, when its text parses. */
export function childNumber(parent: Element | Document, localName: string): number | undefined {
  const text = childText(parent, localName);
  if (text === "") return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Read a list of child elements as trimmed strings.
 *
 * Canvas writes empty elements for "not set", so blank entries are dropped.
 */
export function childTexts(parent: Element | Document, localName: string): string[] {
  return childElements(parent, localName)
    .map((el) => (el.textContent ?? "").trim())
    .filter((text) => text !== "");
}
