import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readDoc, writeDoc, parseOutcomes } from "../src/lib/outcomes/parse.js";
import { validate, losForOutcome } from "../src/lib/outcomes/validate.js";

const fixture = readFileSync(
  fileURLToPath(new URL("../fixtures/bio101-outcomes.yaml", import.meta.url)),
  "utf8",
);

describe("outcomes round-trip (release gate)", () => {
  it("preserves content and comments through parse -> serialize", () => {
    const doc = readDoc(fixture);
    const out = writeDoc(doc);
    // The advisory-only comment must survive; it's the canary for fidelity.
    expect(out).toContain("advisory only; never enforced");
    // Re-parsing the output yields the same typed model.
    expect(parseOutcomes(out)).toEqual(parseOutcomes(fixture));
  });
});

describe("outcomes model", () => {
  const doc = parseOutcomes(fixture);

  it("reads terminology, outcomes, and objectives", () => {
    expect(doc.terminology.outcome).toBe("Course Outcome");
    expect(doc.outcomes).toHaveLength(2);
    expect(doc.objectives).toHaveLength(3);
  });

  it("computes reverse views without storing them", () => {
    expect(losForOutcome(doc, "co_0a1").sort()).toEqual(["lo_1", "lo_2"]);
    expect(losForOutcome(doc, "co_0b2")).toEqual(["lo_3"]);
  });

  it("produces no warnings on a clean fixture", () => {
    const warns = validate(doc).filter((f) => f.severity === "warn");
    expect(warns).toEqual([]);
  });
});

describe("outcomes validation is loose (flags, never throws)", () => {
  it("flags a dangling mapping but still parses", () => {
    const broken = fixture.replace("maps_to: [co_0a1]", "maps_to: [co_nope]");
    const doc = parseOutcomes(broken);
    expect(doc.objectives.length).toBeGreaterThan(0); // still usable
    const warns = validate(doc).filter((f) => f.severity === "warn");
    expect(warns.some((w) => w.message.includes("co_nope"))).toBe(true);
  });
});
