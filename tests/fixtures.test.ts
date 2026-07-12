import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readDoc, writeDoc, parseOutcomes } from "../src/lib/outcomes/parse.js";
import { validate } from "../src/lib/outcomes/validate.js";

const dir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const all = readdirSync(dir).filter((f) => f.endsWith("outcomes.yaml"));
// bio101 is hand-authored with tight flow sequences ([lo_1]); it round-trips
// semantically but not byte-for-byte (eemeli spaces those out). The generated
// course samples are normalized fixed points, so we hold them to the stricter bar.
const samples = all.filter((f) => f !== "bio101-outcomes.yaml");

describe("sample course fixtures (CCSS math)", () => {
  it("includes the traditional pathway", () => {
    expect(samples).toEqual(
      expect.arrayContaining([
        "algebra-1-outcomes.yaml",
        "geometry-outcomes.yaml",
        "algebra-2-outcomes.yaml",
      ]),
    );
  });

  for (const f of samples) {
    it(`${f} round-trips byte-identical`, () => {
      const orig = readFileSync(dir + f, "utf8");
      expect(writeDoc(readDoc(orig))).toBe(orig);
    });

    it(`${f} validates with no flags and reads as a full course`, () => {
      const model = parseOutcomes(readFileSync(dir + f, "utf8"));
      expect(validate(model)).toEqual([]);
      // "Full course": several outcomes and a substantial set of objectives.
      expect(model.outcomes.length).toBeGreaterThanOrEqual(4);
      expect(model.objectives.length).toBeGreaterThanOrEqual(30);
    });
  }
});
