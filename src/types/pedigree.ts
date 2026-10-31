export type PersonId = string;

export type ParentPair = readonly [PersonId, PersonId];

export type PedigreePerson = {
  id: PersonId;
  name: string;
  parents: ParentPair | null;
  birthYear?: string;
  sex?: string;
  isPrivate?: boolean;
};

export type PedigreeData = {
  name: string;
  people: PedigreePerson[];
};

export type RelationshipAnalysis = {
  relationship: number;
  kinship: number;
  firstPersonInbreeding: number;
  secondPersonInbreeding: number;
  commonAncestors: PedigreePerson[];
  routes: RelationshipRoute[];
};

export type RelationshipRoute = {
  key: string;
  ancestorIds: PersonId[];
  label: string;
  contribution: number;
  firstDistance: number;
  secondDistance: number;
  directAncestorId?: PersonId;
  directDescendantId?: PersonId;
};
