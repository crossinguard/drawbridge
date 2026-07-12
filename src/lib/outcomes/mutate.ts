// Mutations for drawbridge-outcomes/1.
//
// Every function edits the eemeli `Document` in place — never the lossy typed
// model. That is what keeps round-trip fidelity: touching one node leaves every
// other node's comments, unknown keys, and formatting intact. The UI re-derives
// its typed view (toModel) after each call; it never serializes the model.
//
// IDs are immutable once minted here. Callers pass ids to target existing nodes;
// they never renumber.
//
// Framework-free. No Svelte, no DOM, no Astro.

import { type Document, YAMLSeq, YAMLMap, isSeq, isMap } from "yaml";
import { newId, type IdPrefix } from "./ids.js";

/** Collect every id in the document (co, eo, lo) for collision-free minting. */
export function collectIds(doc: Document): Set<string> {
  const raw = (doc.toJSON() ?? {}) as {
    outcomes?: { id?: unknown; evidence?: { id?: unknown }[] }[];
    objectives?: { id?: unknown }[];
  };
  const ids = new Set<string>();
  for (const co of raw.outcomes ?? []) {
    if (co?.id != null) ids.add(String(co.id));
    for (const eo of co?.evidence ?? []) {
      if (eo?.id != null) ids.add(String(eo.id));
    }
  }
  for (const lo of raw.objectives ?? []) {
    if (lo?.id != null) ids.add(String(lo.id));
  }
  return ids;
}

/** Get a top-level sequence, creating an empty one if absent. */
function ensureSeq(doc: Document, key: string): YAMLSeq {
  const node = doc.get(key);
  if (isSeq(node)) return node as YAMLSeq;
  const seq = doc.createNode([]) as unknown as YAMLSeq;
  doc.set(key, seq);
  return seq;
}

/** Find the YAMLMap in `seq` whose `id` scalar equals `id`. */
function findById(seq: YAMLSeq, id: string): YAMLMap | undefined {
  for (const item of seq.items) {
    if (isMap(item) && item.get("id") === id) return item as YAMLMap;
  }
  return undefined;
}

function indexById(seq: YAMLSeq, id: string): number {
  return seq.items.findIndex((it) => isMap(it) && it.get("id") === id);
}

function mint(doc: Document, prefix: IdPrefix): string {
  return newId(prefix, collectIds(doc));
}

// — Course Outcomes ————————————————————————————————————————————————————————

/** Append a new Course Outcome. Returns the minted id. */
export function addOutcome(doc: Document, text = ""): string {
  const seq = ensureSeq(doc, "outcomes");
  const id = mint(doc, "co");
  seq.add(doc.createNode({ id, text }));
  return id;
}

export function setOutcomeText(doc: Document, coId: string, text: string): void {
  findById(ensureSeq(doc, "outcomes"), coId)?.set("text", text);
}

export function removeOutcome(doc: Document, coId: string): void {
  const seq = doc.get("outcomes");
  if (!isSeq(seq)) return;
  const idx = indexById(seq as YAMLSeq, coId);
  if (idx >= 0) (seq as YAMLSeq).items.splice(idx, 1);
}

// — Evidence Outcomes ——————————————————————————————————————————————————————

/** Append an Evidence Outcome under a Course Outcome. Returns the minted id, or null if the CO is missing. */
export function addEvidence(doc: Document, coId: string, text = ""): string | null {
  const co = findById(ensureSeq(doc, "outcomes"), coId);
  if (!co) return null;
  let ev = co.get("evidence");
  if (!isSeq(ev)) {
    ev = doc.createNode([]);
    co.set("evidence", ev);
  }
  const id = mint(doc, "eo");
  (ev as YAMLSeq).add(doc.createNode({ id, text }));
  return id;
}

export function setEvidenceText(
  doc: Document,
  coId: string,
  eoId: string,
  text: string,
): void {
  const co = findById(ensureSeq(doc, "outcomes"), coId);
  const ev = co?.get("evidence");
  if (isSeq(ev)) findById(ev as YAMLSeq, eoId)?.set("text", text);
}

export function removeEvidence(doc: Document, coId: string, eoId: string): void {
  const co = findById(ensureSeq(doc, "outcomes"), coId);
  const ev = co?.get("evidence");
  if (!isSeq(ev)) return;
  const idx = indexById(ev as YAMLSeq, eoId);
  if (idx >= 0) (ev as YAMLSeq).items.splice(idx, 1);
}

/** Replace an evidence outcome's advisory `scope`. Empty removes the key entirely. */
export function setEvidenceScope(
  doc: Document,
  coId: string,
  eoId: string,
  loIds: string[],
): void {
  const co = findById(ensureSeq(doc, "outcomes"), coId);
  const ev = co?.get("evidence");
  if (!isSeq(ev)) return;
  const eo = findById(ev as YAMLSeq, eoId);
  if (!eo) return;
  if (loIds.length === 0) eo.delete("scope");
  else eo.set("scope", doc.createNode(loIds));
}

// — Learning Objectives ————————————————————————————————————————————————————

/** Append a Learning Objective. Returns the minted id. */
export function addObjective(
  doc: Document,
  text = "",
  mapsTo: string[] = [],
): string {
  const seq = ensureSeq(doc, "objectives");
  const id = mint(doc, "lo");
  seq.add(doc.createNode({ id, text, maps_to: mapsTo }));
  return id;
}

export function setObjectiveText(doc: Document, loId: string, text: string): void {
  findById(ensureSeq(doc, "objectives"), loId)?.set("text", text);
}

export function removeObjective(doc: Document, loId: string): void {
  const seq = doc.get("objectives");
  if (!isSeq(seq)) return;
  const idx = indexById(seq as YAMLSeq, loId);
  if (idx >= 0) (seq as YAMLSeq).items.splice(idx, 1);
}

// — Reordering ——————————————————————————————————————————————————————————————
// Moving swaps whole nodes, so a node's comments, maps_to, and scope travel with
// it. `dir` is -1 (up) or +1 (down); out-of-range moves are no-ops.

function swap(seq: YAMLSeq, id: string, dir: number): void {
  const i = indexById(seq, id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= seq.items.length) return;
  const items = seq.items;
  [items[i], items[j]] = [items[j], items[i]];
}

export function moveOutcome(doc: Document, coId: string, dir: number): void {
  const seq = doc.get("outcomes");
  if (isSeq(seq)) swap(seq as YAMLSeq, coId, dir);
}

export function moveEvidence(
  doc: Document,
  coId: string,
  eoId: string,
  dir: number,
): void {
  const co = findById(ensureSeq(doc, "outcomes"), coId);
  const ev = co?.get("evidence");
  if (isSeq(ev)) swap(ev as YAMLSeq, eoId, dir);
}

export function moveObjective(doc: Document, loId: string, dir: number): void {
  const seq = doc.get("objectives");
  if (isSeq(seq)) swap(seq as YAMLSeq, loId, dir);
}

/** Move a node to an absolute index within its sequence (for drag-and-drop).
 * Splices the whole node out and reinserts it, so comments/alignment travel. */
function moveTo(seq: YAMLSeq, id: string, toIndex: number): void {
  const from = indexById(seq, id);
  if (from < 0) return;
  const clamped = Math.max(0, Math.min(toIndex, seq.items.length - 1));
  if (clamped === from) return;
  const [node] = seq.items.splice(from, 1);
  seq.items.splice(clamped, 0, node);
}

export function moveOutcomeTo(doc: Document, coId: string, toIndex: number): void {
  const seq = doc.get("outcomes");
  if (isSeq(seq)) moveTo(seq as YAMLSeq, coId, toIndex);
}

export function moveEvidenceTo(
  doc: Document,
  coId: string,
  eoId: string,
  toIndex: number,
): void {
  const co = findById(ensureSeq(doc, "outcomes"), coId);
  const ev = co?.get("evidence");
  if (isSeq(ev)) moveTo(ev as YAMLSeq, eoId, toIndex);
}

export function moveObjectiveTo(doc: Document, loId: string, toIndex: number): void {
  const seq = doc.get("objectives");
  if (isSeq(seq)) moveTo(seq as YAMLSeq, loId, toIndex);
}

/** Replace an objective's CO mappings wholesale. */
export function setObjectiveMapping(
  doc: Document,
  loId: string,
  coIds: string[],
): void {
  findById(ensureSeq(doc, "objectives"), loId)?.set(
    "maps_to",
    doc.createNode(coIds),
  );
}

// — Prefixes & custom identifiers ——————————————————————————————————————————————

/** Set the display prefix for a tier (e.g. "CO"). Written under `prefixes`. */
export function setPrefix(
  doc: Document,
  tier: "outcome" | "evidence" | "objective",
  value: string,
): void {
  doc.setIn(["prefixes", tier], value);
}

/** Set (or, when empty, clear) a node's custom `code` identifier. */
function setNodeCode(node: YAMLMap | undefined, code: string): void {
  if (!node) return;
  if (code.trim() === "") node.delete("code");
  else node.set("code", code);
}

export function setOutcomeCode(doc: Document, coId: string, code: string): void {
  setNodeCode(findById(ensureSeq(doc, "outcomes"), coId), code);
}

export function setEvidenceCode(
  doc: Document,
  coId: string,
  eoId: string,
  code: string,
): void {
  const co = findById(ensureSeq(doc, "outcomes"), coId);
  const ev = co?.get("evidence");
  if (isSeq(ev)) setNodeCode(findById(ev as YAMLSeq, eoId), code);
}

export function setObjectiveCode(doc: Document, loId: string, code: string): void {
  setNodeCode(findById(ensureSeq(doc, "objectives"), loId), code);
}
