import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseOutcomes } from "../src/lib/outcomes/parse.js";
import { groupByOutcome } from "../src/lib/outcomes/grouping.js";

const fixture = readFileSync(
  fileURLToPath(new URL("../fixtures/bio101-outcomes.yaml", import.meta.url)),
  "utf8",
);

const ids = (los: { id: string }[]) => los.map((l) => l.id);

describe("groupByOutcome nests objectives under outcomes", () => {
  const grouped = groupByOutcome(parseOutcomes(fixture));

  it("pins a scoped LO under its EO, not at CO level", () => {
    const co = grouped.outcomes.find((g) => g.co.id === "co_0a1")!;
    const scopedEo = co.evidence.find((e) => e.eo.id === "eo_0a1a")!;
    expect(ids(scopedEo.objectives)).toEqual(["lo_1"]); // scope: [lo_1]
    // lo_1 is pinned under the EO, so only lo_2 remains at CO level.
    expect(ids(co.objectives)).toEqual(["lo_2"]);
  });

  it("puts a CO's unscoped mapped LOs at the CO level", () => {
    const co = grouped.outcomes.find((g) => g.co.id === "co_0b2")!;
    expect(co.evidence.every((e) => e.objectives.length === 0)).toBe(true);
    expect(ids(co.objectives)).toEqual(["lo_3"]);
  });

  it("has no unassigned objectives in a fully-mapped fixture", () => {
    expect(grouped.unassigned).toEqual([]);
  });

  it("collects LOs mapped to no CO as unassigned", () => {
    const doc = parseOutcomes(
      fixture.replace("maps_to: [co_0b2]", "maps_to: []"),
    );
    const grouped2 = groupByOutcome(doc);
    expect(ids(grouped2.unassigned)).toEqual(["lo_3"]);
  });

  it("shows an LO under every CO it maps to", () => {
    const doc = parseOutcomes(
      fixture.replace("maps_to: [co_0b2]", "maps_to: [co_0a1, co_0b2]"),
    );
    const g = groupByOutcome(doc);
    const inA = ids(g.outcomes.find((x) => x.co.id === "co_0a1")!.objectives);
    const inB = ids(g.outcomes.find((x) => x.co.id === "co_0b2")!.objectives);
    expect(inA).toContain("lo_3");
    expect(inB).toContain("lo_3");
  });
});
