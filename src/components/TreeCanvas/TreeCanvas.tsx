import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { PedigreePerson, PersonId } from "../../types/pedigree";
import "./TreeCanvas.css";

type TreeCanvasProps = {
  people: readonly PedigreePerson[];
  selectedIds: readonly [PersonId, PersonId];
};

type PositionedPerson = PedigreePerson & { x: number; y: number };

const ROW_HEIGHT = 132;
const NODE_WIDTH = 112;

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const positionPeople = (people: readonly PedigreePerson[]) => {
  const generations = new Map<PersonId, number>();
  const remaining = [...people];
  const visibleIds = new Set(people.map(({ id }) => id));

  for (let pass = 0; pass < people.length && remaining.length; pass += 1) {
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const person = remaining[index];
      const visibleParents = person.parents?.filter((id) => visibleIds.has(id)) ?? [];
      if (!visibleParents.length) {
        generations.set(person.id, 0);
        remaining.splice(index, 1);
        continue;
      }

      const parentGenerations = visibleParents.map((id) => generations.get(id));
      if (parentGenerations.every((generation) => generation !== undefined)) {
        generations.set(person.id, Math.max(...parentGenerations as number[]) + 1);
        remaining.splice(index, 1);
      }
    }
  }

  const byGeneration = new Map<number, PedigreePerson[]>();
  people.filter(({ isPrivate }) => !isPrivate).forEach((person) => {
    const generation = generations.get(person.id) ?? 0;
    const row = byGeneration.get(generation) ?? [];
    row.push(person);
    byGeneration.set(generation, row);
  });

  const children = new Map<PersonId, PersonId[]>();
  people.forEach((person) => person.parents?.forEach((parentId) => {
    children.set(parentId, [...(children.get(parentId) ?? []), person.id]);
  }));

  const rowPositions = () => {
    const positions = new Map<PersonId, number>();
    byGeneration.forEach((row) => row.forEach((person, index) => {
      positions.set(person.id, row.length === 1 ? .5 : index / (row.length - 1));
    }));
    return positions;
  };

  const maxGeneration = Math.max(0, ...byGeneration.keys());
  for (let pass = 0; pass < 6; pass += 1) {
    let positions = rowPositions();
    for (let generation = 1; generation <= maxGeneration; generation += 1) {
      byGeneration.get(generation)?.sort((first, second) => {
        const score = (person: PedigreePerson) => {
          const parentPositions = person.parents?.map((id) => positions.get(id)).filter((value): value is number => value !== undefined) ?? [];
          return parentPositions.length ? average(parentPositions) : positions.get(person.id) ?? 0;
        };
        return score(first) - score(second);
      });
      positions = rowPositions();
    }

    positions = rowPositions();
    for (let generation = maxGeneration - 1; generation >= 0; generation -= 1) {
      byGeneration.get(generation)?.sort((first, second) => {
        const score = (person: PedigreePerson) => {
          const childPositions = (children.get(person.id) ?? []).map((id) => positions.get(id)).filter((value): value is number => value !== undefined);
          return childPositions.length ? average(childPositions) : positions.get(person.id) ?? 0;
        };
        return score(first) - score(second);
      });
      positions = rowPositions();
    }
  }

  const largestRow = Math.max(1, ...[...byGeneration.values()].map((row) => row.length));
  const width = Math.max(820, largestRow * 156 + 120);
  const height = Math.max(430, (maxGeneration + 1) * ROW_HEIGHT + 88);
  const positioned = new Map<PersonId, PositionedPerson>();

  byGeneration.forEach((row, generation) => {
    const spacing = (width - 88) / Math.max(1, row.length);
    const rowWidth = spacing * row.length;
    const startX = (width - rowWidth) / 2 + spacing / 2;
    row.forEach((person, index) => positioned.set(person.id, {
      ...person,
      x: startX + spacing * index,
      y: generation * ROW_HEIGHT + 76,
    }));
  });

  return { width, height, positioned, maxGeneration };
};

const TreeCanvas = ({ people, selectedIds }: TreeCanvasProps) => {
  const [zoom, setZoom] = useState(1);
  const layout = useMemo(() => positionPeople(people), [people]);

  return <section className="tree-canvas" aria-label="Family tree">
    <header className="tree-canvas__toolbar">
      <div>
        <span className="eyebrow">Relevant pedigree</span>
        <strong>{people.filter(({ isPrivate }) => !isPrivate).length} people</strong>
      </div>
      <div className="tree-canvas__zoom">
        <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.65, value - .15))}><Minus /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.75, value + .15))}><Plus /></button>
      </div>
    </header>
    <div className="tree-canvas__viewport">
      <svg
        aria-label="Pedigree diagram"
        role="img"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={{ width: layout.width * zoom, height: layout.height * zoom }}
      >
        <g className="tree-canvas__generations" aria-hidden="true">
          {Array.from({ length: layout.maxGeneration + 1 }, (_, generation) => <g key={generation}>
            <rect height={ROW_HEIGHT} width={layout.width} x="0" y={generation * ROW_HEIGHT + 10} />
            <text x="14" y={generation * ROW_HEIGHT + 30}>Generation {generation + 1}</text>
          </g>)}
        </g>
        <g className="tree-canvas__edges">
          {[...layout.positioned.values()].flatMap((person) => person.parents?.map((parentId) => {
            const parent = layout.positioned.get(parentId);
            if (!parent) return null;
            const selected = selectedIds.includes(person.id) || selectedIds.includes(parent.id);
            const middleY = parent.y + (person.y - parent.y) * .52;
            return <path
              className={selected ? "is-selected" : undefined}
              d={`M ${parent.x} ${parent.y + 29} V ${middleY} H ${person.x} V ${person.y - 29}`}
              key={`${parentId}-${person.id}`}
            />;
          }) ?? [])}
        </g>
        {[...layout.positioned.values()].map((person) => <g
          className={`tree-person ${selectedIds.includes(person.id) ? "is-selected" : ""}`}
          key={person.id}
          transform={`translate(${person.x - NODE_WIDTH / 2}, ${person.y - 28})`}
        >
          <rect width={NODE_WIDTH} height="56" rx="2" />
          <text x={NODE_WIDTH / 2} y="24" textAnchor="middle">{person.name.slice(0, 19)}</text>
          <text className="tree-person__meta" x={NODE_WIDTH / 2} y="43" textAnchor="middle">{person.birthYear ?? person.id}</text>
        </g>)}
      </svg>
    </div>
  </section>;
};

export default TreeCanvas;
