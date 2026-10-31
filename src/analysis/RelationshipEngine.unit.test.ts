import { describe, expect, test } from "vitest";
import { samplePedigree } from "../data/samplePedigree";
import type { PedigreeData } from "../types/pedigree";
import {
  PedigreeValidationError,
  RelationshipEngine,
} from "./RelationshipEngine";

describe("RelationshipEngine", () => {
  test("calculates common outbred relationships", () => {
    const engine = new RelationshipEngine(samplePedigree);

    expect(engine.relationship("X", "Z")).toBe(0.5);
    expect(engine.relationship("Z", "M")).toBe(0.5);
    expect(engine.relationship("B", "V")).toBe(0.125);
    expect(engine.relationship("C", "V")).toBe(0.25);
  });

  test("combines multiple relationship paths", () => {
    const engine = new RelationshipEngine(samplePedigree);

    expect(engine.relationship("A", "V")).toBe(0.1875);
    expect(engine.kinship("A", "V")).toBe(0.09375);
    expect(engine.relationshipRoutes("A", "V").map((route) => ({
      ancestors: route.ancestorIds,
      contribution: route.contribution,
    }))).toEqual([
      { ancestors: ["W", "Z"], contribution: 0.125 },
      { ancestors: ["X", "Y"], contribution: 0.0625 },
    ]);
  });

  test("reports only the nearest independent route for ordinary relatives", () => {
    const engine = new RelationshipEngine(samplePedigree);

    expect(engine.relationshipRoutes("D", "E").map(({ ancestorIds }) => ancestorIds)).toEqual([["R", "V"]]);
  });

  test("describes a direct ancestor without listing every upstream ancestor", () => {
    const engine = new RelationshipEngine(samplePedigree);
    const [route] = engine.relationshipRoutes("V", "D");

    expect(route.label).toBe("Mother and son");
    expect(route.directAncestorId).toBe("V");
    expect(route.directDescendantId).toBe("D");
  });

  test("uses recorded sex in avuncular labels without guessing missing values", () => {
    const engine = new RelationshipEngine(samplePedigree);

    expect(engine.relationshipRoutes("A", "V")[0].label).toBe("Great-aunt and great-niece");
    expect(engine.relationshipRoutes("J", "V")[0].label).toBe("Great-great-aunt and great-great-niece/nephew");
  });

  test("extracts the connecting pedigree without unrelated branches", () => {
    const engine = new RelationshipEngine(samplePedigree);

    expect([...engine.relationshipSubgraph("A", "V")].sort()).toEqual(
      ["A", "B", "C", "M", "U", "V", "W", "X", "Y", "Z"].sort(),
    );
  });

  test("calculates inbreeding and self-relationship", () => {
    const engine = new RelationshipEngine(samplePedigree);

    expect(engine.inbreeding("A")).toBe(0.03125);
    expect(engine.relationship("A", "A")).toBe(1.03125);
  });

  test("handles half-siblings and related nonshared parents", () => {
    const data: PedigreeData = {
      name: "Three-quarter siblings",
      people: [
        { id: "G1", name: "G1", parents: null },
        { id: "G2", name: "G2", parents: null },
        { id: "P", name: "P", parents: null },
        { id: "Q", name: "Q", parents: ["G1", "G2"] },
        { id: "R", name: "R", parents: ["G1", "G2"] },
        { id: "S1", name: "S1", parents: ["P", "Q"] },
        { id: "S2", name: "S2", parents: ["P", "R"] },
      ],
    };
    const engine = new RelationshipEngine(data);

    expect(engine.relationship("S1", "S2")).toBe(0.375);
  });

  test("memoizes pair calculations symmetrically", () => {
    const engine = new RelationshipEngine(samplePedigree);

    engine.relationship("A", "V");
    const cacheSize = engine.cacheSize;
    engine.relationship("V", "A");

    expect(engine.cacheSize).toBe(cacheSize);
  });

  test("rejects ancestry cycles", () => {
    const cyclic: PedigreeData = {
      name: "Invalid",
      people: [
        { id: "A", name: "A", parents: ["B", "C"] },
        { id: "B", name: "B", parents: ["A", "C"] },
        { id: "C", name: "C", parents: null },
      ],
    };

    expect(() => new RelationshipEngine(cyclic)).toThrow(PedigreeValidationError);
  });
});
