import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readDoc, writeDoc, parseOutcomes, toModel } from "../src/lib/outcomes/parse.js";
import { losForOutcome } from "../src/lib/outcomes/validate.js";
import { displayNumbers, identifierMap } from "../src/lib/outcomes/numbering.js";
import { moveOutcome, moveEvidence, moveObjective } from "../src/lib/outcomes/mutate.js";

const fixture = readFileSync(
  fileURLToPath(new URL("../fixtures/bio101-outcomes.yaml", import.meta.url)),
  "utf8",
);
const CANARY = "advisory only; never enforced";

describe("display numbering derives from order", () => {
  it("numbers COs, EOs (with parent CO), and LOs", () => {
    const nums = displayNumbers(parseOutcomes(fixture));
    expect(nums.outcome.get("co_0a1")).toBe("1");
    expect(nums.outcome.get("co_0b2")).toBe("2");
    expect(nums.evidence.get("eo_0a1a")).toBe("1.1");
    expect(nums.evidence.get("eo_0a1b")).toBe("1.2");
    expect(nums.evidence.get("eo_0b2a")).toBe("2.1");
    expect(nums.objective.get("lo_3")).toBe("3");
  });
});

describe("identifierMap: prefix + number, or a custom code", () => {
  it("uses the tier prefix and derived number by default", () => {
    const map = identifierMap(parseOutcomes(fixture));
    expect(map.get("co_0a1")).toBe("CO 1");
    expect(map.get("eo_0a1a")).toBe("EO 1.1");
    expect(map.get("lo_3")).toBe("LO 3");
  });

  it("honors a custom tier prefix and a per-item code", () => {
    const model = parseOutcomes(fixture);
    model.prefixes.objective = "STD";
    model.outcomes[0].code = "CORE";
    const map = identifierMap(model);
    expect(map.get("co_0a1")).toBe("CORE"); // per-item code wins
    expect(map.get("lo_1")).toBe("STD 1"); // custom prefix + number
  });
});

describe("reordering keeps ids stable and alignment intact", () => {
  it("moving a CO down renumbers display but not ids or references", () => {
    const doc = readDoc(fixture);
    moveOutcome(doc, "co_0a1", +1); // co_0a1 was #1, becomes #2
    const out = writeDoc(doc);
    expect(out).toContain(CANARY); // node moved with its comment
    const model = parseOutcomes(out);
    expect(model.outcomes.map((c) => c.id)).toEqual(["co_0b2", "co_0a1"]);
    // References still resolve — LOs mapped to co_0a1 are unchanged.
    expect(losForOutcome(model, "co_0a1").sort()).toEqual(["lo_1", "lo_2"]);
    // Display numbers reflect the new order.
    const nums = displayNumbers(model);
    expect(nums.outcome.get("co_0a1")).toBe("2");
    expect(nums.outcome.get("co_0b2")).toBe("1");
    expect(nums.evidence.get("eo_0a1a")).toBe("2.1"); // EO renumbers with its CO
  });

  it("moving evidence within a CO reorders only that CO", () => {
    const doc = readDoc(fixture);
    moveEvidence(doc, "co_0a1", "eo_0a1b", -1); // 1.2 → 1.1
    const co = parseOutcomes(writeDoc(doc)).outcomes.find((c) => c.id === "co_0a1")!;
    expect(co.evidence.map((e) => e.id)).toEqual(["eo_0a1b", "eo_0a1a"]);
  });

  it("moving an objective reorders the objective list", () => {
    const doc = readDoc(fixture);
    moveObjective(doc, "lo_3", -1);
    const model = parseOutcomes(writeDoc(doc));
    expect(model.objectives.map((l) => l.id)).toEqual(["lo_1", "lo_3", "lo_2"]);
  });

  it("is a no-op at the boundaries", () => {
    const doc = readDoc(fixture);
    moveOutcome(doc, "co_0a1", -1); // already first
    expect(toModel(doc).outcomes.map((c) => c.id)).toEqual(["co_0a1", "co_0b2"]);
  });
});
