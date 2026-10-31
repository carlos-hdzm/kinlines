import type { PedigreePerson, PersonId, RelationshipAnalysis } from "../../types/pedigree";
import "./RelationshipPanel.css";

type RelationshipPanelProps = {
  analysis: RelationshipAnalysis;
  firstPerson: PedigreePerson;
  secondPerson: PedigreePerson;
  peopleById: ReadonlyMap<PersonId, PedigreePerson>;
};

const percent = (value: number, digits = 3) => `${(value * 100).toFixed(digits)}%`;

const RelationshipPanel = ({
  analysis,
  firstPerson,
  secondPerson,
  peopleById,
}: RelationshipPanelProps) => <aside className="relationship-panel" aria-live="polite">
  <span className="eyebrow">Expected relationship</span>
  <div className="relationship-panel__value">{percent(analysis.relationship)}</div>
  <p className="relationship-panel__kinship">Kinship φ = {percent(analysis.kinship)}</p>

  {analysis.routes.length ? <div className="relationship-panel__routes">
    <div className="relationship-panel__meter" aria-hidden="true">{analysis.routes.map((route, index) => <span key={route.key} className={index % 2 ? "secondary" : ""} style={{ width: `${analysis.relationship ? route.contribution / analysis.relationship * 100 : 0}%` }} />)}</div>
    {analysis.routes.map((route, index) => {
      const names = route.ancestorIds.map((id) => peopleById.get(id)?.name ?? id);
      const directAncestor = route.directAncestorId ? peopleById.get(route.directAncestorId) : undefined;
      const directDescendant = route.directDescendantId ? peopleById.get(route.directDescendantId) : undefined;
      return <section className={`relationship-path ${index % 2 ? "relationship-path--secondary" : ""}`} key={route.key}>
        <div className="relationship-path__heading"><strong>{route.label}</strong><strong>{index ? "+" : ""}{percent(route.contribution)}</strong></div>
        <p>{directAncestor && directDescendant
          ? `${directAncestor.name} is an ancestor of ${directDescendant.name}.`
          : `Through ${new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(names)}`}</p>
      </section>;
    })}
  </div> : <section className="relationship-panel__summary">
    <h3>{firstPerson.name} and {secondPerson.name}</h3>
    <p>No relationship paths were found in the recorded pedigree.</p>
  </section>}

  {analysis.commonAncestors.length > analysis.routes.reduce((count, route) => count + route.ancestorIds.length, 0) && <details className="relationship-panel__technical">
    <summary>Why fewer ancestors are shown</summary>
    <p>The report shows independent relationship routes. It omits more distant ancestors already represented through a nearer shared ancestor. The coefficient still uses the complete pedigree.</p>
  </details>}

  <dl className="relationship-panel__details">
    <div><dt>{firstPerson.name} · F</dt><dd>{percent(analysis.firstPersonInbreeding)}</dd></div>
    <div><dt>{secondPerson.name} · F</dt><dd>{percent(analysis.secondPersonInbreeding)}</dd></div>
  </dl>
</aside>;

export default RelationshipPanel;
