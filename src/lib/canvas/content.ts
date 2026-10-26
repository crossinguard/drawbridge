/**
 * Turning Canvas content HTML into something safe to show.
 *
 * Course content arrives as raw HTML from a Canvas instance, written by
 * whichever editor the teacher happened to use. It is not trusted: it can
 * carry scripts, event handlers, and images hosted elsewhere. The content is
 * therefore rebuilt from scratch against an allowlist of tags and attributes,
 * and Canvas' own link placeholders are rewritten into links the viewer can
 * follow.
 */

/** How a link found in course content should be treated. */
export type LinkKind =
  "internal-page" | "internal-file" | "canvas-course" | "external" | "canvas-api" | "mailto" | "anchor" | "other";

/** A link found in course content. */
export interface ContentLink {
  /** The URL exactly as it was written in the export. */
  href: string;
  /** The visible text of the link. */
  label: string;
  kind: LinkKind;
  /** Page identifier, for links to another page in the same course. */
  targetId?: string;
  /** Path inside the cartridge, for links to a file in the export. */
  path?: string;
  /** Host name, for links that leave the export. */
  host?: string;
  /** True when the reference came from an image rather than a link. */
  isImage?: boolean;
}

/** An image that lives inside the cartridge. */
export interface ContentImage {
  alt: string;
  /** Path inside the cartridge. */
  path: string;
}

/** The result of sanitising one piece of course content. */
export interface ProcessedContent {
  /** Sanitised HTML, safe to inject into the page. */
  html: string;
  /** Plain text, used for search. */
  text: string;
  links: ContentLink[];
  images: ContentImage[];
  /** How many references to the source Canvas instance were found. */
  apiReferenceCount: number;
}

/** Tags that survive sanitising. */
const ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
]);

/** Attributes allowed on any element. */
const GLOBAL_ATTRS = new Set(["dir", "lang", "title"]);

/**
 * Extra attributes allowed on specific elements.
 *
 * `href` is handled separately, because the link's destination decides
 * whether it survives at all.
 */
const TAG_ATTRS: Record<string, Set<string>> = {
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  details: new Set(["open"]),
  img: new Set(["alt", "height", "src", "width"]),
  li: new Set(["value"]),
  ol: new Set(["start", "type"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  time: new Set(["datetime"]),
};

/** Tags dropped along with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  "applet",
  "base",
  "canvas",
  "embed",
  "frame",
  "frameset",
  "iframe",
  "link",
  "math",
  "meta",
  "noscript",
  "object",
  "portal",
  "script",
  "style",
  "svg",
  "template",
]);

/** The placeholder Canvas writes in front of a file inside the cartridge. */
const FILE_BASE_PREFIX = "$IMS-CC-FILEBASE$/";
/** The placeholder Canvas writes in front of a link to another page. */
const WIKI_REFERENCE_PREFIX = "$WIKI_REFERENCE$/pages/";
/** The placeholder Canvas writes in front of a link into the Canvas UI. */
const CANVAS_REFERENCE_PREFIX = "$CANVAS_COURSE_REFERENCE$/";

/** State collected while walking a piece of content. */
interface WalkContext {
  links: ContentLink[];
  images: ContentImage[];
  apiReferenceCount: number;
}

/**
 * Sanitise course content and describe what it contains.
 *
 * @param html The raw HTML of the content.
 * @param courseDomain The Canvas domain the course came from. Links to it
 *   are recognised as API references rather than ordinary external links.
 */
export function processContent(html: string, courseDomain?: string): ProcessedContent {
  const context: WalkContext = { links: [], images: [], apiReferenceCount: 0 };

  const source = new DOMParser().parseFromString(html, "text/html");
  const target = new DOMParser().parseFromString("<!doctype html><html><body></body></html>", "text/html");

  const body = source.body;
  if (body) {
    for (const node of rebuild(body, target, context, courseDomain)) {
      target.body.appendChild(node);
    }
  }

  return {
    html: target.body.innerHTML,
    text: (target.body.textContent ?? "").replace(/\s+/g, " ").trim(),
    links: context.links,
    images: context.images,
    apiReferenceCount: context.apiReferenceCount,
  };
}

/** Rebuild the children of `source` into safe nodes. */
function rebuild(source: Element, target: Document, context: WalkContext, courseDomain?: string): Node[] {
  const nodes: Node[] = [];

  for (const child of Array.from(source.childNodes)) {
    // Text node.
    if (child.nodeType === 3) {
      nodes.push(target.createTextNode(child.textContent ?? ""));
      continue;
    }
    // Anything that is not an element (comments, processing instructions).
    if (child.nodeType !== 1) continue;

    const element = child as Element;
    const name = element.localName.toLowerCase();

    // Count the references Canvas leaves behind to its own API.
    if (element.hasAttribute("data-api-endpoint") || element.hasAttribute("data-api-returntype")) {
      context.apiReferenceCount++;
    }

    if (DROP_WITH_CONTENT.has(name)) {
      // Media and frames still point somewhere worth reporting.
      harvestSources(element, context, courseDomain);
      continue;
    }

    if (!ALLOWED_TAGS.has(name)) {
      // Unknown but harmless: keep the content, drop the wrapper.
      nodes.push(...rebuild(element, target, context, courseDomain));
      continue;
    }

    if (name === "img") {
      const image = rebuildImage(element, target, context, courseDomain);
      if (image) nodes.push(image);
      continue;
    }

    const clean = target.createElement(name);
    copyAttributes(element, clean, name);

    for (const node of rebuild(element, target, context, courseDomain)) {
      clean.appendChild(node);
    }

    if (name === "a") {
      rebuildLink(element, clean, context, courseDomain);
    }

    nodes.push(clean);
  }

  return nodes;
}

/** Copy the attributes an element is allowed to keep. */
function copyAttributes(source: Element, target: Element, tagName: string): void {
  const allowed = TAG_ATTRS[tagName];
  for (const attribute of Array.from(source.attributes)) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith("on")) continue;
    if (name.startsWith("data-")) continue;
    if (!GLOBAL_ATTRS.has(name) && !allowed?.has(name)) continue;
    target.setAttribute(attribute.name, attribute.value);
  }
}

/** Rebuild an image, resolving it to a file inside the cartridge when possible. */
function rebuildImage(source: Element, target: Document, context: WalkContext, courseDomain?: string): Element | null {
  const src = (source.getAttribute("src") ?? "").trim();
  const alt = (source.getAttribute("alt") ?? "").trim();

  if (src === "") return null;

  // A data URL is already self-contained; the page's CSP allows it.
  if (src.startsWith("data:")) {
    const clean = target.createElement("img");
    clean.setAttribute("src", src);
    if (alt) clean.setAttribute("alt", alt);
    return clean;
  }

  if (src.startsWith(FILE_BASE_PREFIX)) {
    const path = fileBasePath(src.slice(FILE_BASE_PREFIX.length));
    context.images.push({ alt, path });
    const clean = target.createElement("img");
    clean.setAttribute("data-canvas-image", path);
    clean.setAttribute("alt", alt);
    const width = source.getAttribute("width");
    const height = source.getAttribute("height");
    if (width) clean.setAttribute("width", width);
    if (height) clean.setAttribute("height", height);
    return clean;
  }

  // An image that lives outside the cartridge is not shown — loading it would
  // make a request to a third party. It is reported instead.
  context.links.push({
    href: src,
    label: alt || src,
    kind: classifyUrl(src, courseDomain),
    host: hostOf(src),
    isImage: true,
  });

  return null;
}

/** Rebuild a link, rewriting Canvas' placeholders into viewer links. */
function rebuildLink(source: Element, target: Element, context: WalkContext, courseDomain?: string): void {
  const href = (source.getAttribute("href") ?? "").trim();
  const label = (source.textContent ?? "").replace(/\s+/g, " ").trim();

  if (href === "") {
    context.links.push({ href: "", label, kind: "other" });
    return;
  }

  if (href.startsWith(WIKI_REFERENCE_PREFIX)) {
    const targetId = href.slice(WIKI_REFERENCE_PREFIX.length).split(/[?#]/)[0];
    context.links.push({ href, label, kind: "internal-page", targetId });
    target.setAttribute("href", `#page-${targetId}`);
    target.setAttribute("data-canvas-target", `page:${targetId}`);
    return;
  }

  if (href.startsWith(CANVAS_REFERENCE_PREFIX)) {
    context.links.push({ href, label, kind: "canvas-course" });
    target.setAttribute("href", "#");
    target.setAttribute("data-canvas-target", "outline");
    return;
  }

  if (href.startsWith(FILE_BASE_PREFIX)) {
    const path = fileBasePath(href.slice(FILE_BASE_PREFIX.length));
    context.links.push({ href, label, kind: "internal-file", path });
    target.setAttribute("href", "#");
    target.setAttribute("data-canvas-target", `file:${path}`);
    return;
  }

  if (href.startsWith("#")) {
    context.links.push({ href, label, kind: "anchor" });
    target.setAttribute("href", href);
    return;
  }

  if (href.startsWith("mailto:")) {
    context.links.push({ href, label, kind: "mailto" });
    target.setAttribute("href", href);
    return;
  }

  if (/^https?:\/\//i.test(href)) {
    const kind = classifyUrl(href, courseDomain);
    context.links.push({ href, label, kind, host: hostOf(href) });
    target.setAttribute("href", href);
    target.setAttribute("target", "_blank");
    target.setAttribute("rel", "noopener noreferrer nofollow");
    return;
  }

  // `javascript:` and anything else unexpected is dropped.
  context.links.push({ href, label, kind: "other" });
}

/** Record the sources of media and frames that are about to be dropped. */
function harvestSources(element: Element, context: WalkContext, courseDomain?: string): void {
  for (const attribute of ["src", "data"]) {
    const value = (element.getAttribute(attribute) ?? "").trim();
    if (value === "" || value.startsWith("data:")) continue;
    context.links.push({
      href: value,
      label: element.localName.toLowerCase(),
      kind: classifyUrl(value, courseDomain),
      host: hostOf(value),
    });
  }
}

/** Turn a Canvas file placeholder into a path inside the cartridge. */
export function fileBasePath(rest: string): string {
  return `web_resources/${rest.replace(/^\/+/, "")}`;
}

/** Classify a URL found in course content. */
export function classifyUrl(url: string, courseDomain?: string): LinkKind {
  if (url.startsWith(FILE_BASE_PREFIX)) return "internal-file";
  if (url.startsWith(WIKI_REFERENCE_PREFIX)) return "internal-page";
  if (url.startsWith(CANVAS_REFERENCE_PREFIX)) return "canvas-course";
  if (url.startsWith("mailto:")) return "mailto";
  if (url.startsWith("#")) return "anchor";
  if (/^https?:\/\//i.test(url)) {
    const host = hostOf(url);
    if (courseDomain && host && host === courseDomain) return "canvas-api";
    return "external";
  }
  return "other";
}

/** The host of a URL, without a leading `www.`. */
export function hostOf(url: string): string | undefined {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url);
  if (!match) return undefined;
  const host = match[1].toLowerCase().replace(/:\d+$/, "");
  return host.startsWith("www.") ? host.slice(4) : host;
}
