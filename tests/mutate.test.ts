import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readDoc, writeDoc, parseOutcomes } from "../src/lib/outcomes/parse.js";
import { losForOutcome, validate } from "../src/lib/outcomes/validate.js";
import { identifierMap } from "../src/lib/outcomes/numbering.js";
import {
  addOutcome,
  setOutcomeText,
  removeOutcome,
  addEvidence,
  setEvidenceText,
  setEvidenceScope,
  removeEvidence,
  addObjective,
  setObjectiveText,
  removeObjective,
  setObjectiveMapping,
  setPrefix,
  setOutcomeCode,
  setObjectiveCode,
  collectIds,
} from "../src/lib/outcomes/mutate.js";
import { newId } from "../src/lib/outcomes/ids.js";

const fixture = readFileSync(
  fileURLToPath(new URL("../fixtures/bio101-outcomes.yaml", import.meta.url)),
  "utf8",
);

// The canary comment that proves untouched nodes keep their formatting.
const CANARY = "advisory only; never enforced";

describe("mutations preserve round-trip fidelity", () => {
  it("editing one CO's text leaves every other node's comment intact", () => {
    const doc = readDoc(fixture);
    setOutcomeText(doc, "co_0b2", "Analyze the cell — revised.");
    const out = writeDoc(doc);
    expect(out).toContain(CANARY); // untouched node's comment survives
    expect(out).toContain("Analyze the cell — revised.");
    // The sibling CO is untouched.
    expect(out).toContain("Explain the flow of energy and matter through living systems.");
  });

  it("adds a CO that re-parses and doesn't disturb existing content", () => {
    const doc = readDoc(fixture);
    const id = addOutcome(doc, "A brand-new outcome.");
    expect(id).toMatch(/^co_[0-9a-z]{4}$/);
    const out = writeDoc(doc);
    expect(out).toContain(CANARY);
    const model = parseOutcomes(out);
    expect(model.outcomes).toHaveLength(3);
    expect(model.outcomes.at(-1)).toMatchObject({ id, text: "A brand-new outcome." });
  });

  it("adds evidence under a CO and re-parses", () => {
    const doc = readDoc(fixture);
    const id = addEvidence(doc, "co_0b2", "New evidence line.");
    expect(id).toMatch(/^eo_[0-9a-z]{4}$/);
    const model = parseOutcomes(writeDoc(doc));
    const co = model.outcomes.find((c) => c.id === "co_0b2")!;
    expect(co.evidence.map((e) => e.id)).toContain(id);
  });

  it("edits and removes evidence", () => {
    const doc = readDoc(fixture);
    setEvidenceText(doc, "co_0a1", "eo_0a1a", "Cellular respiration, reworded.");
    removeEvidence(doc, "co_0a1", "eo_0a1b");
    const model = parseOutcomes(writeDoc(doc));
    const co = model.outcomes.find((c) => c.id === "co_0a1")!;
    expect(co.evidence.map((e) => e.id)).toEqual(["eo_0a1a"]);
    expect(co.evidence[0].text).toBe("Cellular respiration, reworded.");
  });

  it("sets and clears an evidence outcome's scope", () => {
    const doc = readDoc(fixture);
    // eo_0a1b starts with no scope.
    setEvidenceScope(doc, "co_0a1", "eo_0a1b", ["lo_1"]);
    let co = parseOutcomes(writeDoc(doc)).outcomes.find((c) => c.id === "co_0a1")!;
    expect(co.evidence.find((e) => e.id === "eo_0a1b")!.scope).toEqual(["lo_1"]);
    // Clearing removes the key entirely (scope is optional/advisory).
    setEvidenceScope(doc, "co_0a1", "eo_0a1b", []);
    co = parseOutcomes(writeDoc(doc)).outcomes.find((c) => c.id === "co_0a1")!;
    expect(co.evidence.find((e) => e.id === "eo_0a1b")!.scope).toBeUndefined();
  });

  it("adds an objective with a mapping, then rewrites the mapping", () => {
    const doc = readDoc(fixture);
    const id = addObjective(doc, "A new objective.", ["co_0b2"]);
    expect(id).toMatch(/^lo_[0-9a-z]{4}$/);
    setObjectiveMapping(doc, id, ["co_0a1", "co_0b2"]);
    const model = parseOutcomes(writeDoc(doc));
    expect(losForOutcome(model, "co_0a1")).toContain(id);
    expect(losForOutcome(model, "co_0b2")).toContain(id);
  });

  it("edits and removes objectives without touching comments", () => {
    const doc = readDoc(fixture);
    setObjectiveText(doc, "lo_1", "Identify energy-producing organelles.");
    removeObjective(doc, "lo_3");
    const out = writeDoc(doc);
    expect(out).toContain(CANARY);
    const model = parseOutcomes(out);
    expect(model.objectives.map((l) => l.id)).toEqual(["lo_1", "lo_2"]);
    expect(model.objectives[0].text).toBe("Identify energy-producing organelles.");
  });

  it("removing a CO drops only that CO", () => {
    const doc = readDoc(fixture);
    removeOutcome(doc, "co_0a1");
    const model = parseOutcomes(writeDoc(doc));
    expect(model.outcomes.map((c) => c.id)).toEqual(["co_0b2"]);
  });
});

describe("prefixes and custom identifiers", () => {
  it("sets a tier prefix, preserved through round-trip", () => {
    const doc = readDoc(fixture);
    setPrefix(doc, "objective", "STD");
    const out = writeDoc(doc);
    expect(out).toContain(CANARY); // untouched nodes keep their comments
    expect(identifierMap(parseOutcomes(out)).get("lo_1")).toBe("STD 1");
  });

  it("sets and clears a per-item custom code", () => {
    const doc = readDoc(fixture);
    setOutcomeCode(doc, "co_0a1", "CORE-1");
    let model = parseOutcomes(writeDoc(doc));
    expect(model.outcomes.find((c) => c.id === "co_0a1")!.code).toBe("CORE-1");
    expect(identifierMap(model).get("co_0a1")).toBe("CORE-1");
    // Clearing reverts to the auto-number.
    setOutcomeCode(doc, "co_0a1", "");
    model = parseOutcomes(writeDoc(doc));
    expect(model.outcomes.find((c) => c.id === "co_0a1")!.code).toBeUndefined();
    expect(identifierMap(model).get("co_0a1")).toBe("CO 1");
  });

  it("warns on duplicate codes", () => {
    const doc = readDoc(fixture);
    setOutcomeCode(doc, "co_0a1", "X1");
    setObjectiveCode(doc, "lo_1", "X1");
    const warns = validate(parseOutcomes(writeDoc(doc))).filter((f) =>
      f.message.includes("Duplicate identifier"),
    );
    expect(warns).toHaveLength(2);
  });
});

describe("id minting", () => {
  it("collects every id in the fixture", () => {
    const ids = collectIds(readDoc(fixture));
    expect(ids).toContain("co_0a1");
    expect(ids).toContain("eo_0a1a");
    expect(ids).toContain("lo_3");
  });

  it("never mints a colliding id", () => {
    // A rng that first yields all-zeros (→ co_0000) then advances, forcing the
    // collision branch when co_0000 is already taken.
    const seq = [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const rng = () => seq[Math.min(i++, seq.length - 1)];
    const taken = new Set(["co_0000"]);
    const id = newId("co", taken, rng);
    expect(id).not.toBe("co_0000");
    expect(id).toMatch(/^co_[0-9a-z]{4}$/);
  });
});
