// Per-tool reactive state for the Outcome Builder.
//
// The eemeli Document is the working source of truth; it is mutated in place by
// the framework-free mutate.ts layer, and a revision counter drives reactivity
// (nanostores compares by reference, so we hand out a fresh session object after
// each edit). The typed model and validation flags are derived, never stored.
//
// `dirty` tracks edits made since the last import/export (hard rule #6: files are
// canonical; never let state silently diverge from the last exported file). The
// working document is also mirrored to IndexedDB on every change, so a reload or
// crash recovers in-progress edits — with `dirty` persisted, the divergence
// indicator survives too. IndexedDB is a recovery copy only, never the record.
//
// Store exports are intentionally NOT $-prefixed so Svelte's `$store` auto-
// subscription reads cleanly (e.g. `$session`, `$outcomeModel`).

import { atom, computed } from "nanostores";
import { Document } from "yaml";
import { readDoc, toModel } from "$lib/outcomes/parse";
import { validate } from "$lib/outcomes/validate";
import { DEFAULT_TERMINOLOGY } from "$lib/outcomes/types";
import { displayNumbers, identifierMap } from "$lib/outcomes/numbering";
import * as mut from "$lib/outcomes/mutate";
import {
  saveWorkingCopy,
  loadWorkingCopy,
  clearWorkingCopy,
} from "$lib/storage/recovery";

const TOOL = "outcomes";

export type Selection =
  | { kind: "co"; id: string }
  | { kind: "eo"; id: string; coId: string }
  | { kind: "lo"; id: string }
  | null;

interface Session {
  doc: Document | null;
  fileName: string | null;
  /** Edited since the last import/export. */
  dirty: boolean;
  /** Bumped on every change so derived stores recompute. */
  rev: number;
}

export const session = atom<Session>({
  doc: null,
  fileName: null,
  dirty: false,
  rev: 0,
});

export const selection = atom<Selection>(null);

/** When set, the current session was restored from a recovery copy saved at this
 * epoch-ms time. Cleared once the user imports, starts new, or exports. */
export const recoveredAt = atom<number | null>(null);

// Mirror the working document to IndexedDB on every change (best-effort). The
// callback fires immediately with the initial empty session — doc is null, so it
// no-ops until there's something to recover.
session.subscribe((s) => {
  if (!s.doc) return;
  void saveWorkingCopy({
    tool: TOOL,
    text: s.doc.toString(),
    fileName: s.fileName,
    dirty: s.dirty,
    savedAt: Date.now(),
  });
});

export const outcomeModel = computed(session, (s) =>
  s.doc ? toModel(s.doc) : null,
);

export const flags = computed(outcomeModel, (m) => (m ? validate(m) : []));

export const numbers = computed(outcomeModel, (m) =>
  m
    ? displayNumbers(m)
    : { outcome: new Map(), evidence: new Map(), objective: new Map() },
);

/** id → display identifier ("CO 1", "EO 2.1", or a custom code). Single source
 * of truth for what an item is called on screen. */
export const identifiers = computed(outcomeModel, (m) =>
  m ? identifierMap(m) : new Map<string, string>(),
);

/** A fresh, empty document with default terminology — the "New" starting point. */
function blankDoc(): Document {
  return new Document({
    schema: "drawbridge-outcomes/1",
    terminology: { ...DEFAULT_TERMINOLOGY },
    course: { title: "", code: "" },
    outcomes: [],
    objectives: [],
  });
}

function setDoc(doc: Document, fileName: string | null) {
  session.set({ doc, fileName, dirty: false, rev: session.get().rev + 1 });
  selection.set(null);
  recoveredAt.set(null); // a deliberate import/new is not a recovery
}

/** Run a mutation against the live Document, then bump reactivity + mark dirty. */
function edit(mutator: (doc: Document) => void) {
  const s = session.get();
  if (!s.doc) return;
  mutator(s.doc);
  session.set({ ...s, dirty: true, rev: s.rev + 1 });
}

export const actions = {
  loadText(text: string, fileName: string) {
    setDoc(readDoc(text), fileName);
  },

  newBlank() {
    setDoc(blankDoc(), null);
  },

  /** Serialize for export. Callers do the file download; we clear the dirty flag. */
  exportText(fileName?: string): string | null {
    const s = session.get();
    if (!s.doc) return null;
    const text = s.doc.toString();
    session.set({ ...s, dirty: false, fileName: fileName ?? s.fileName });
    recoveredAt.set(null); // exported to a file — the recovery notice is resolved
    return text;
  },

  /** Restore an unsaved session from IndexedDB, if one exists and nothing is
   * loaded yet. Returns true if a copy was restored. */
  async restore(): Promise<boolean> {
    if (session.get().doc) return false; // don't clobber an active session
    const wc = await loadWorkingCopy(TOOL);
    if (!wc) return false;
    try {
      const doc = readDoc(wc.text);
      session.set({
        doc,
        fileName: wc.fileName,
        dirty: wc.dirty,
        rev: session.get().rev + 1,
      });
      selection.set(null);
      recoveredAt.set(wc.savedAt);
      return true;
    } catch {
      return false; // corrupt copy: leave the user at the empty state
    }
  },

  /** Drop the recovered session and its stored copy, back to empty. */
  async discardRecovered(): Promise<void> {
    await clearWorkingCopy(TOOL);
    recoveredAt.set(null);
    session.set({ doc: null, fileName: null, dirty: false, rev: session.get().rev + 1 });
    selection.set(null);
  },

  setCourse(field: "title" | "code", value: string) {
    edit((doc) => doc.setIn(["course", field], value));
  },
  setTerminology(field: "outcome" | "evidence" | "objective", value: string) {
    edit((doc) => doc.setIn(["terminology", field], value));
  },
  setPrefix(tier: "outcome" | "evidence" | "objective", value: string) {
    edit((doc) => mut.setPrefix(doc, tier, value));
  },

  /** Set (or clear, when empty) a node's custom identifier. */
  setCode(sel: NonNullable<Selection>, code: string) {
    edit((doc) => {
      if (sel.kind === "co") mut.setOutcomeCode(doc, sel.id, code);
      else if (sel.kind === "eo") mut.setEvidenceCode(doc, sel.coId, sel.id, code);
      else mut.setObjectiveCode(doc, sel.id, code);
    });
  },

  addOutcome() {
    let id = "";
    edit((doc) => (id = mut.addOutcome(doc)));
    if (id) selection.set({ kind: "co", id });
  },
  setOutcomeText(coId: string, text: string) {
    edit((doc) => mut.setOutcomeText(doc, coId, text));
  },
  removeOutcome(coId: string) {
    edit((doc) => mut.removeOutcome(doc, coId));
    clearSelectionIf((sel) => sel.id === coId);
  },

  addEvidence(coId: string) {
    let id: string | null = null;
    edit((doc) => (id = mut.addEvidence(doc, coId)));
    if (id) selection.set({ kind: "eo", id, coId });
  },
  setEvidenceText(coId: string, eoId: string, text: string) {
    edit((doc) => mut.setEvidenceText(doc, coId, eoId, text));
  },
  setEvidenceScope(coId: string, eoId: string, loIds: string[]) {
    edit((doc) => mut.setEvidenceScope(doc, coId, eoId, loIds));
  },
  removeEvidence(coId: string, eoId: string) {
    edit((doc) => mut.removeEvidence(doc, coId, eoId));
    clearSelectionIf((sel) => sel.id === eoId);
  },

  addObjective() {
    let id = "";
    edit((doc) => (id = mut.addObjective(doc)));
    if (id) selection.set({ kind: "lo", id });
  },
  setObjectiveText(loId: string, text: string) {
    edit((doc) => mut.setObjectiveText(doc, loId, text));
  },
  setObjectiveMapping(loId: string, coIds: string[]) {
    edit((doc) => mut.setObjectiveMapping(doc, loId, coIds));
  },
  removeObjective(loId: string) {
    edit((doc) => mut.removeObjective(doc, loId));
    clearSelectionIf((sel) => sel.id === loId);
  },

  moveOutcome(coId: string, dir: number) {
    edit((doc) => mut.moveOutcome(doc, coId, dir));
  },
  moveEvidence(coId: string, eoId: string, dir: number) {
    edit((doc) => mut.moveEvidence(doc, coId, eoId, dir));
  },
  moveObjective(loId: string, dir: number) {
    edit((doc) => mut.moveObjective(doc, loId, dir));
  },

  select(sel: Selection) {
    selection.set(sel);
  },

  /** Resolve an id to its Selection (kind + parent) and select it. */
  selectById(id: string) {
    const m = outcomeModel.get();
    if (!m) return;
    if (m.outcomes.some((c) => c.id === id)) {
      selection.set({ kind: "co", id });
      return;
    }
    for (const co of m.outcomes) {
      if (co.evidence.some((e) => e.id === id)) {
        selection.set({ kind: "eo", id, coId: co.id });
        return;
      }
    }
    if (m.objectives.some((l) => l.id === id)) selection.set({ kind: "lo", id });
  },
};

function clearSelectionIf(pred: (sel: NonNullable<Selection>) => boolean) {
  const sel = selection.get();
  if (sel && pred(sel)) selection.set(null);
}
