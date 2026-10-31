import { describe, expect, test } from "vitest";
import { parseGedcom } from "./parseGedcom";

const encode = (value: string) => new TextEncoder().encode(value).buffer;

describe("parseGedcom", () => {
  test("normalizes individuals and biological family links", () => {
    const data = parseGedcom(encode(`0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Ada /Lovelace/
1 SEX F
0 @I2@ INDI
1 NAME Charles /Babbage/
1 SEX M
0 @I3@ INDI
1 NAME Example /Child/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR`), "example.ged");

    expect(data.name).toBe("example");
    expect(data.people).toHaveLength(3);
    expect(data.people.find(({ id }) => id === "@I1@")?.name).toBe("Ada Lovelace");
    expect(data.people.find(({ id }) => id === "@I1@")?.sex).toBe("F");
    expect(data.people.find(({ id }) => id === "@I2@")?.sex).toBe("M");
    expect(data.people.find(({ id }) => id === "@I3@")?.sex).toBeUndefined();
    expect(data.people.find(({ id }) => id === "@I3@")?.parents)
      .toEqual(["@I1@", "@I2@"]);
  });

  test("creates a unique phantom founder for a missing parent", () => {
    const data = parseGedcom(encode(`0 HEAD
0 @I1@ INDI
1 NAME Known /Parent/
0 @I2@ INDI
1 NAME Child /Person/
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
0 TRLR`), "partial.ged");
    const child = data.people.find(({ id }) => id === "@I2@");

    expect(child?.parents?.[0]).toBe("@I1@");
    expect(child?.parents?.[1]).toContain("__unknown__:@F1@");
  });
});
