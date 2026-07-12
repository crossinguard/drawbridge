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
