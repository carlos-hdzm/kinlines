import type {
  PedigreeData,
  PedigreePerson,
  PersonId,
  RelationshipAnalysis,
  RelationshipRoute,
} from "../types/pedigree";

const pairKey = (first: PersonId, second: PersonId) =>
  first < second ? `${first}\u0000${second}` : `${second}\u0000${first}`;

export class PedigreeValidationError extends Error {}

export class RelationshipEngine {
  readonly people: ReadonlyMap<PersonId, PedigreePerson>;

  readonly orderedPeople: readonly PedigreePerson[];

  private readonly order = new Map<PersonId, number>();

  private readonly relationshipCache = new Map<string, number>();

  private readonly ancestorCache = new Map<PersonId, Set<PersonId>>();

  constructor(data: PedigreeData) {
    const people = new Map<PersonId, PedigreePerson>();

    data.people.forEach((person) => {
      if (people.has(person.id)) {
        throw new PedigreeValidationError(`Duplicate person identifier: ${person.id}`);
      }

      people.set(person.id, person);
    });

    data.people.forEach((person) => {
      person.parents?.forEach((parentId) => {
        if (parentId === person.id) {
          throw new PedigreeValidationError(`${person.name} cannot be their own parent.`);
        }

        if (!people.has(parentId)) {
          throw new PedigreeValidationError(
            `${person.name} refers to a missing parent: ${parentId}`,
          );
        }
      });
    });

    this.people = people;
    this.orderedPeople = this.topologicalSort(data.people);
    this.orderedPeople.forEach((person, index) => this.order.set(person.id, index));
  }

  relationship(firstId: PersonId, secondId: PersonId): number {
    this.assertPerson(firstId);
    this.assertPerson(secondId);

    const key = pairKey(firstId, secondId);
    const cached = this.relationshipCache.get(key);

    if (cached !== undefined) return cached;

    let value: number;

    if (firstId === secondId) {
      const person = this.people.get(firstId)!;
      value = person.parents
        ? 1 + this.relationship(person.parents[0], person.parents[1]) / 2
        : 1;
    } else {
      const firstOrder = this.order.get(firstId)!;
      const secondOrder = this.order.get(secondId)!;
      const laterId = firstOrder > secondOrder ? firstId : secondId;
      const earlierId = laterId === firstId ? secondId : firstId;
      const later = this.people.get(laterId)!;

      value = later.parents
        ? (this.relationship(later.parents[0], earlierId)
          + this.relationship(later.parents[1], earlierId)) / 2
        : 0;
    }

    this.relationshipCache.set(key, value);
    return value;
  }

  kinship(firstId: PersonId, secondId: PersonId): number {
    return this.relationship(firstId, secondId) / 2;
  }

  inbreeding(personId: PersonId): number {
    const person = this.people.get(personId);
    this.assertPerson(personId);

    return person!.parents
      ? this.relationship(person!.parents[0], person!.parents[1]) / 2
      : 0;
  }

  analyze(firstId: PersonId, secondId: PersonId): RelationshipAnalysis {
    return {
      relationship: this.relationship(firstId, secondId),
      kinship: this.kinship(firstId, secondId),
      firstPersonInbreeding: this.inbreeding(firstId),
      secondPersonInbreeding: this.inbreeding(secondId),
      commonAncestors: this.commonAncestors(firstId, secondId),
      routes: this.relationshipRoutes(firstId, secondId),
    };
  }

  relationshipRoutes(firstId: PersonId, secondId: PersonId): RelationshipRoute[] {
    this.assertPerson(firstId);
    this.assertPerson(secondId);

    const firstToSecond = this.shortestAncestryPath(firstId, secondId);
    if (firstToSecond) {
      return [this.directRoute(secondId, firstId, firstToSecond.length - 1)];
    }

    const secondToFirst = this.shortestAncestryPath(secondId, firstId);
    if (secondToFirst) {
      return [this.directRoute(firstId, secondId, secondToFirst.length - 1)];
    }

    type PathPair = {
      ancestorId: PersonId;
      firstPath: PersonId[];
      secondPath: PersonId[];
      contribution: number;
    };
    const pathPairs: PathPair[] = [];

    this.commonAncestors(firstId, secondId).forEach((ancestor) => {
      const firstPaths = this.ancestryPaths(firstId, ancestor.id);
      const secondPaths = this.ancestryPaths(secondId, ancestor.id);

      firstPaths.forEach((firstPath) => secondPaths.forEach((secondPath) => {
        const firstInterior = new Set(firstPath.slice(1, -1));
        const independent = secondPath.slice(1, -1).every((id) => !firstInterior.has(id));
        if (!independent) return;

        const distance = firstPath.length + secondPath.length - 2;
        pathPairs.push({
          ancestorId: ancestor.id,
          firstPath,
          secondPath,
          contribution: (1 + this.inbreeding(ancestor.id)) * 2 ** (-distance),
        });
      }));
    });

    const grouped = new Map<string, PathPair[]>();
    pathPairs.forEach((pair) => {
      const firstBranch = pair.firstPath.at(-2) ?? firstId;
      const secondBranch = pair.secondPath.at(-2) ?? secondId;
      const key = [pair.firstPath.length, pair.secondPath.length, firstBranch, secondBranch].join("|");
      grouped.set(key, [...(grouped.get(key) ?? []), pair]);
    });

    return [...grouped.entries()].map(([key, pairs]) => {
      const firstDistance = pairs[0].firstPath.length - 1;
      const secondDistance = pairs[0].secondPath.length - 1;
      const ancestorIds = [...new Set(pairs.map(({ ancestorId }) => ancestorId))];
      return {
        key,
        ancestorIds,
        firstDistance,
        secondDistance,
        label: this.collateralLabel(firstId, secondId, firstDistance, secondDistance, ancestorIds.length === 1),
        contribution: pairs.reduce((sum, pair) => sum + pair.contribution, 0),
      };
    }).sort((first, second) => {
      const distanceDifference = first.firstDistance + first.secondDistance
        - second.firstDistance - second.secondDistance;
      return distanceDifference || second.contribution - first.contribution;
    });
  }

  relationshipSubgraph(firstId: PersonId, secondId: PersonId): Set<PersonId> {
    this.assertPerson(firstId);
    this.assertPerson(secondId);
    const included = new Set<PersonId>([firstId, secondId]);
    const includePath = (path: PersonId[]) => path.forEach((id) => included.add(id));

    const directPath = this.shortestAncestryPath(firstId, secondId)
      ?? this.shortestAncestryPath(secondId, firstId);
    if (directPath) {
      includePath(directPath);
      return included;
    }

    this.relationshipRoutes(firstId, secondId).forEach(({ ancestorIds }) => {
      ancestorIds.forEach((ancestorId) => {
        const firstPaths = this.ancestryPaths(firstId, ancestorId);
        const secondPaths = this.ancestryPaths(secondId, ancestorId);
        firstPaths.forEach((firstPath) => secondPaths.forEach((secondPath) => {
          const firstInterior = new Set(firstPath.slice(1, -1));
          if (!secondPath.slice(1, -1).every((id) => !firstInterior.has(id))) return;
          includePath(firstPath);
          includePath(secondPath);
        }));
      });
    });
    return included;
  }

  ancestors(personId: PersonId): Set<PersonId> {
    this.assertPerson(personId);
    const cached = this.ancestorCache.get(personId);

    if (cached) return new Set(cached);

    const ancestors = new Set<PersonId>();
    const stack = [...(this.people.get(personId)!.parents ?? [])];

    while (stack.length) {
      const ancestorId = stack.pop()!;
      if (ancestors.has(ancestorId)) continue;

      ancestors.add(ancestorId);
      const ancestor = this.people.get(ancestorId);
      if (ancestor?.parents) stack.push(...ancestor.parents);
    }

    this.ancestorCache.set(personId, ancestors);
    return new Set(ancestors);
  }

  commonAncestors(firstId: PersonId, secondId: PersonId): PedigreePerson[] {
    const firstAncestors = this.ancestors(firstId);
    const secondAncestors = this.ancestors(secondId);

    return [...firstAncestors]
      .filter((id) => secondAncestors.has(id))
      .map((id) => this.people.get(id)!)
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  get cacheSize(): number {
    return this.relationshipCache.size;
  }

  private assertPerson(personId: PersonId) {
    if (!this.people.has(personId)) {
      throw new PedigreeValidationError(`Unknown person identifier: ${personId}`);
    }
  }

  private ancestryPaths(descendantId: PersonId, ancestorId: PersonId): PersonId[][] {
    const paths: PersonId[][] = [];
    const visit = (currentId: PersonId, path: PersonId[]) => {
      if (paths.length >= 128 || path.length > this.people.size) return;
      if (currentId === ancestorId) {
        paths.push(path);
        return;
      }
      this.people.get(currentId)?.parents?.forEach((parentId) => visit(parentId, [...path, parentId]));
    };
    visit(descendantId, [descendantId]);
    return paths;
  }

  private shortestAncestryPath(descendantId: PersonId, ancestorId: PersonId): PersonId[] | null {
    const queue: PersonId[][] = [[descendantId]];
    const visited = new Set<PersonId>();
    for (let index = 0; index < queue.length; index += 1) {
      const path = queue[index];
      const currentId = path.at(-1)!;
      if (currentId === ancestorId) return path;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      this.people.get(currentId)?.parents?.forEach((parentId) => queue.push([...path, parentId]));
    }
    return null;
  }

  private directRoute(ancestorId: PersonId, descendantId: PersonId, distance: number): RelationshipRoute {
    const ancestorTerm = this.sexedTerm(ancestorId, "father", "mother", "parent");
    const descendantTerm = this.sexedTerm(descendantId, "son", "daughter", "child");
    const prefix = distance < 2 ? "" : distance === 2 ? "grand" : `${"great-".repeat(distance - 2)}grand`;
    const generation = `${prefix}${ancestorTerm} and ${prefix}${descendantTerm}`;
    return {
      key: `direct|${ancestorId}|${descendantId}`,
      ancestorIds: [ancestorId],
      label: generation[0].toUpperCase() + generation.slice(1),
      contribution: this.relationship(ancestorId, descendantId),
      firstDistance: distance,
      secondDistance: 0,
      directAncestorId: ancestorId,
      directDescendantId: descendantId,
    };
  }

  private collateralLabel(firstId: PersonId, secondId: PersonId, firstDistance: number, secondDistance: number, half: boolean): string {
    const near = Math.min(firstDistance, secondDistance);
    const far = Math.max(firstDistance, secondDistance);
    if (near === 1 && far === 1) {
      const first = this.sexedTerm(firstId, "brother", "sister", "sibling");
      const second = this.sexedTerm(secondId, "brother", "sister", "sibling");
      const relationship = first === second ? `${first}s` : `${first} and ${second}`;
      const label = `${half ? "half-" : ""}${relationship}`;
      return label[0].toUpperCase() + label.slice(1);
    }
    if (near === 1) {
      const greats = Math.max(0, far - 2);
      const nearId = firstDistance === near ? firstId : secondId;
      const farId = firstDistance === far ? firstId : secondId;
      const auntOrUncle = this.sexedTerm(nearId, "uncle", "aunt", "aunt/uncle");
      const nieceOrNephew = this.sexedTerm(farId, "nephew", "niece", "niece/nephew");
      const label = `${half ? "half-" : ""}${"great-".repeat(greats)}${auntOrUncle} and ${"great-".repeat(greats)}${nieceOrNephew}`;
      return label[0].toUpperCase() + label.slice(1);
    }
    const degree = near - 1;
    const removed = far - near;
    const ordinal = degree === 1 ? "First" : degree === 2 ? "Second" : degree === 3 ? "Third" : `${degree}th`;
    const removal = removed === 0 ? "" : removed === 1 ? " once removed" : removed === 2 ? " twice removed" : ` ${removed} times removed`;
    return `${half ? "Half " : ""}${ordinal} cousins${removal}`;
  }

  private sexedTerm(personId: PersonId, male: string, female: string, neutral: string): string {
    const sex = this.people.get(personId)?.sex?.toUpperCase();
    if (sex === "M") return male;
    if (sex === "F") return female;
    return neutral;
  }

  private topologicalSort(people: PedigreePerson[]): PedigreePerson[] {
    const childIds = new Map<PersonId, PersonId[]>();
    const incoming = new Map<PersonId, number>();

    people.forEach((person) => incoming.set(person.id, person.parents?.length ?? 0));
    people.forEach((person) => person.parents?.forEach((parentId) => {
      const children = childIds.get(parentId) ?? [];
      children.push(person.id);
      childIds.set(parentId, children);
    }));

    const queue = people.filter((person) => incoming.get(person.id) === 0);
    const ordered: PedigreePerson[] = [];

    for (let index = 0; index < queue.length; index += 1) {
      const person = queue[index];
      ordered.push(person);

      childIds.get(person.id)?.forEach((childId) => {
        const nextIncoming = incoming.get(childId)! - 1;
        incoming.set(childId, nextIncoming);
        if (nextIncoming === 0) queue.push(this.people.get(childId)!);
      });
    }

    if (ordered.length !== people.length) {
      throw new PedigreeValidationError(
        "The pedigree contains an ancestry cycle and cannot be analyzed.",
      );
    }

    return ordered;
  }
}
