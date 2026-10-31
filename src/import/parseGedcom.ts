import { readGedcom } from "read-gedcom";
import type { PedigreeData, PedigreePerson, PersonId } from "../types/pedigree";

const cleanName = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  return value.replaceAll("/", "").replace(/\s+/g, " ").trim();
};

const firstPointer = (values: (string | null)[]) =>
  values.find((value): value is string => Boolean(value));

export const parseGedcom = (buffer: ArrayBuffer, fileName: string): PedigreeData => {
  const gedcom = readGedcom(buffer);
  const people = new Map<PersonId, PedigreePerson>();

  gedcom.getIndividualRecord().arraySelect().forEach((record) => {
    const id = firstPointer(record.pointer());
    if (!id) return;

    people.set(id, {
      id,
      name: cleanName(record.getName().value()[0] ?? undefined, id),
      parents: null,
      sex: record.getSex().value()[0]?.trim() || undefined,
    });
  });

  gedcom.getFamilyRecord().arraySelect().forEach((family) => {
    const familyId = firstPointer(family.pointer()) ?? "family";
    const knownParents = [
      ...family.getHusband().getIndividualRecord().pointer(),
      ...family.getWife().getIndividualRecord().pointer(),
    ].filter((id): id is string => id !== null && people.has(id));

    if (!knownParents.length) return;

    while (knownParents.length < 2) {
      const phantomId = `__unknown__:${familyId}:${knownParents.length}`;
      people.set(phantomId, {
        id: phantomId,
        name: "Unknown parent",
        parents: null,
        isPrivate: true,
      });
      knownParents.push(phantomId);
    }

    family.getChild().getIndividualRecord().pointer().forEach((childId) => {
      const child = childId ? people.get(childId) : undefined;
      if (!child) return;

      people.set(child.id, {
        ...child,
        parents: [knownParents[0], knownParents[1]],
      });
    });
  });

  if (!people.size) {
    throw new Error("No individual records were found in this GEDCOM file.");
  }

  return {
    name: fileName.replace(/\.ged(com)?$/i, ""),
    people: [...people.values()],
  };
};
