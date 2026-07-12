// Parse and serialize drawbridge-outcomes/1 files.
//
// Round-trip fidelity is release-blocking: comments and unknown keys must
// survive parse -> serialize. We achieve that by keeping the eemeli `Document`
// (its CST/AST preserves comments and unknown keys) as the source of truth for
// serialization, and reading a typed view out of it for the UI. When the UI
// mutates data it edits the Document, so nothing outside the typed view is lost.
//
// This module is intentionally split into two layers:
//   - readDoc / writeDoc  : work on the eemeli Document (fidelity layer)
//   - toModel             : produce the typed OutcomeDoc view for the UI
//
// Framework-free. See docs/01-architecture.md and docs/formats/outcomes-format.md.

import { parseDocument, type Document } from "yaml";
import {
  DEFAULT_TERMINOLOGY,
  DEFAULT_PREFIXES,
  type OutcomeDoc,
  type CourseOutcome,
  type EvidenceOutcome,
  type LearningObjective,
} from "./types.js";

/** Parse YAML text into an eemeli Document (preserves comments + unknown keys). */
export function readDoc(text: string): Document {
  return parseDocument(text);
}

/** Serialize an eemeli Document back to YAML text, comments intact. */
export function writeDoc(doc: Document): string {
  return doc.toString();
}

/**
 * Produce a typed, plain-object view for the UI. This view is lossy by design
 * (it omits comments and unknown keys); it is NEVER the thing we serialize.
 * Serialization always goes through the Document.
 */
export function toModel(doc: Document): OutcomeDoc {
  const raw = doc.toJSON() ?? {};

  const terminology = {
    ...DEFAULT_TERMINOLOGY,
    ...(raw.terminology ?? {}),
  };

  const prefixes = {
    ...DEFAULT_PREFIXES,
    ...(raw.prefixes ?? {}),
  };

  // Carry an optional custom identifier when present, else leave it off.
  const withCode = <T extends object>(node: T, src: any): T =>
    src.code != null && String(src.code) !== ""
      ? { ...node, code: String(src.code) }
      : node;

  const outcomes: CourseOutcome[] = (raw.outcomes ?? []).map((co: any) =>
    withCode(
      {
        id: String(co.id),
        text: String(co.text ?? ""),
        evidence: (co.evidence ?? []).map((eo: any): EvidenceOutcome =>
          withCode(
            {
              id: String(eo.id),
              text: String(eo.text ?? ""),
              ...(eo.scope ? { scope: eo.scope.map(String) } : {}),
            },
            eo,
          ),
        ),
      },
      co,
    ),
  );

  const objectives: LearningObjective[] = (raw.objectives ?? []).map(
    (lo: any): LearningObjective =>
      withCode(
        {
          id: String(lo.id),
          text: String(lo.text ?? ""),
          maps_to: (lo.maps_to ?? []).map(String),
        },
        lo,
      ),
  );

  return {
    schema: "drawbridge-outcomes/1",
    terminology,
    prefixes,
    course: raw.course ?? {},
    outcomes,
    objectives,
  };
}

/** Convenience: text -> typed model, for read-only consumers. */
export function parseOutcomes(text: string): OutcomeDoc {
  return toModel(readDoc(text));
}
