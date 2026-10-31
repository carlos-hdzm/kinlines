import { BookOpen, FileJson, FileUp, GitFork, Grid3X3, Plus, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RelationshipEngine } from "./analysis/RelationshipEngine";
import PersonCombobox from "./components/PersonCombobox/PersonCombobox";
import RelationshipPanel from "./components/RelationshipPanel/RelationshipPanel";
import TreeCanvas from "./components/TreeCanvas/TreeCanvas";
import { parseGedcom } from "./import/parseGedcom";
import type { PedigreeData, PedigreePerson, PersonId } from "./types/pedigree";
import "./App.css";

type View = "tree" | "compare" | "matrix" | "reports";

const viewLabels: Record<View, string> = {
  tree: "Family tree",
  compare: "Compare people",
  matrix: "Relationship matrix",
  reports: "Reports",
};

const percent = (value: number, digits = 3) => `${(value * 100).toFixed(digits)}%`;

const EmptyView = ({ onImport, onSample }: { onImport: () => void; onSample: () => void }) => <section className="empty-view">
  <div className="empty-view__mark" aria-hidden="true"><GitFork /></div>
  <span className="eyebrow">Private pedigree analysis</span>
  <h1>Open a family archive</h1>
  <p>Import a GEDCOM to calculate expected autosomal relationships, kinship, and pedigree inbreeding. Your family data stays in this browser tab.</p>
  <div className="empty-view__actions">
    <button className="button button--primary" onClick={onImport} type="button"><FileUp />Import GEDCOM</button>
    <button className="button" onClick={onSample} type="button"><FileJson />Open sample tree</button>
  </div>
  <p className="empty-view__support">GEDCOM 5.5, 5.5.1, and commonly exported variants are supported.</p>
</section>;

const PersonPickers = ({ firstId, secondId, people, peopleById, onFirst, onSecond }: {
  firstId: PersonId; secondId: PersonId; people: readonly PedigreePerson[];
  peopleById: ReadonlyMap<PersonId, PedigreePerson>;
  onFirst: (id: PersonId) => void; onSecond: (id: PersonId) => void;
}) => <section className="person-pickers" aria-label="People to compare">
  <PersonCombobox excludedId={secondId} key={`first-${firstId}`} label="Person one" onChange={onFirst} people={people} peopleById={peopleById} value={firstId} />
  <span className="person-pickers__and">and</span>
  <PersonCombobox excludedId={firstId} key={`second-${secondId}`} label="Person two" onChange={onSecond} people={people} peopleById={peopleById} value={secondId} />
</section>;

const MatrixView = ({ engine, people, firstId, secondId, onSelectPair }: {
  engine: RelationshipEngine; people: readonly PedigreePerson[];
  firstId: PersonId; secondId: PersonId;
  onSelectPair: (first: PersonId, second: PersonId) => void;
}) => {
  const [additionalIds, setAdditionalIds] = useState<PersonId[]>([]);
  const [browseCount, setBrowseCount] = useState(0);
  const [addedId, setAddedId] = useState<PersonId>();
  const routes = engine.relationshipRoutes(firstId, secondId);
  const focusedIds = new Set<PersonId>([firstId, secondId]);
  [firstId, secondId].forEach((id) => engine.people.get(id)?.parents?.forEach((parentId) => focusedIds.add(parentId)));
  routes.forEach(({ ancestorIds }) => ancestorIds.forEach((id) => focusedIds.add(id)));
  additionalIds.forEach((id) => focusedIds.add(id));
  people.filter(({ id }) => !focusedIds.has(id)).slice(0, browseCount).forEach(({ id }) => focusedIds.add(id));
  const shownPeople = people.filter(({ id }) => focusedIds.has(id));
  const remaining = people.length - shownPeople.length;
  return <section className="matrix-view">
    <div className="section-intro"><span className="eyebrow">Coefficient of relationship, R</span><h2>Comparison matrix</h2><p>Focused on the selected pair, their parents, and explanatory ancestors. Select an off-diagonal value to compare that pair.</p></div>
    <div className="matrix-tools">
      <div className="matrix-tools__search"><PersonCombobox label="Add a person" onChange={(id) => { setAddedId(id); setAdditionalIds((ids) => ids.includes(id) ? ids : [...ids, id]); }} people={people} peopleById={engine.people} value={addedId} /></div>
      {remaining > 0 && <button className="button" onClick={() => setBrowseCount((count) => Math.min(people.length, count + 12))} type="button"><Plus />Show 12 more</button>}
    </div>
    <div className="matrix-scroll"><table><thead><tr><th>Person</th>{shownPeople.map((person) => <th key={person.id} scope="col">{person.name}</th>)}</tr></thead><tbody>{shownPeople.map((rowPerson) => <tr key={rowPerson.id}><th scope="row">{rowPerson.name}</th>{shownPeople.map((columnPerson) => {
      const isSelf = rowPerson.id === columnPerson.id;
      const value = engine.relationship(rowPerson.id, columnPerson.id);
      return <td key={columnPerson.id}>{isSelf
        ? <span className="matrix-self" title={`Self coefficient Rii = 1 + F; F = ${engine.inbreeding(rowPerson.id).toFixed(4)}`}>Rii {value.toFixed(4)}</span>
        : <button aria-label={`Compare ${rowPerson.name} and ${columnPerson.name}`} onClick={() => onSelectPair(rowPerson.id, columnPerson.id)} type="button">{value.toFixed(4)}</button>}</td>;
    })}</tr>)}</tbody></table></div>
    <p className="matrix-note">Showing {shownPeople.length} of {people.length} people. Diagonal entries are self-coefficients Rii = 1 + F, not percentages of DNA shared with oneself.</p>
  </section>;
};

const ReportsView = ({ engine, people }: { engine: RelationshipEngine; people: readonly PedigreePerson[] }) => {
  const inbredPeople = people.map((person) => ({ person, coefficient: engine.inbreeding(person.id) })).filter(({ coefficient }) => coefficient > 0).sort((first, second) => second.coefficient - first.coefficient);
  return <section className="reports-view">
    <div className="section-intro"><span className="eyebrow">Pedigree summary</span><h2>Inbreeding report</h2><p>Expected autozygosity calculated from recorded parental relationships.</p></div>
    <div className="report-summary"><div><span>People</span><strong>{people.length}</strong></div><div><span>With F &gt; 0</span><strong>{inbredPeople.length}</strong></div><div><span>Largest F</span><strong>{percent(inbredPeople[0]?.coefficient ?? 0)}</strong></div></div>
    {inbredPeople.length ? <div className="report-list">{inbredPeople.map(({ person, coefficient }) => <article key={person.id}><div><strong>{person.name}</strong><span>{person.parents ? `Parents: ${person.parents.map((id) => engine.people.get(id)?.name ?? id).join(" and ")}` : "Founder"}</span></div><strong>{percent(coefficient)}</strong></article>)}</div> : <div className="view-empty"><h3>No pedigree inbreeding detected</h3><p>No person’s recorded parents have a nonzero kinship coefficient.</p></div>}
  </section>;
};

const App = () => {
  const [pedigree, setPedigree] = useState<PedigreeData | null>(null);
  const [activeView, setActiveView] = useState<View>("tree");
  const [firstId, setFirstId] = useState<PersonId>();
  const [secondId, setSecondId] = useState<PersonId>();
  const [error, setError] = useState<string>();
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const engine = useMemo(() => pedigree ? new RelationshipEngine(pedigree) : null, [pedigree]);
  const selectablePeople = engine?.orderedPeople.filter(({ isPrivate }) => !isPrivate) ?? [];
  const firstPerson = engine && (engine.people.get(firstId ?? "") ?? selectablePeople[0]);
  const secondPerson = engine && (engine.people.get(secondId ?? "") ?? selectablePeople[1] ?? selectablePeople[0]);
  const analysis = engine && firstPerson && secondPerson ? engine.analyze(firstPerson.id, secondPerson.id) : null;
  const treePeople = (() => {
    if (activeView !== "tree" || !engine || !firstPerson || !secondPerson) return [];
    const relevantIds = engine.relationshipSubgraph(firstPerson.id, secondPerson.id);
    return engine.orderedPeople.filter(({ id, isPrivate }) => relevantIds.has(id) && !isPrivate);
  })();

  const openPedigree = (nextPedigree: PedigreeData, preferredPair?: readonly [PersonId, PersonId]) => {
    const nextEngine = new RelationshipEngine(nextPedigree);
    const visiblePeople = nextEngine.orderedPeople.filter(({ isPrivate }) => !isPrivate);
    if (visiblePeople.length < 2) throw new Error("The tree needs at least two people to compare.");
    setPedigree(nextPedigree);
    setFirstId(preferredPair?.[0] ?? visiblePeople.at(-1)!.id);
    setSecondId(preferredPair?.[1] ?? visiblePeople.at(-2)!.id);
    setActiveView("tree");
    setError(undefined);
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try { openPedigree(parseGedcom(await file.arrayBuffer(), file.name)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "This GEDCOM could not be read."); }
    finally { if (fileInput.current) fileInput.current.value = ""; }
  };

  const loadSample = async () => {
    setIsLoadingSample(true);
    try {
      const sample = (await import("./data/sample-pedigree.json")).default as unknown as PedigreeData;
      openPedigree(sample, ["A", "V"]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The sample tree could not be loaded."); }
    finally { setIsLoadingSample(false); }
  };

  useEffect(() => {
    if (!engine) return;
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "analyze_pedigree_pair", title: "Analyze two people",
      description: "Select two people in the open pedigree and calculate their expected autosomal relationship.",
      inputSchema: { type: "object", properties: { firstId: { type: "string" }, secondId: { type: "string" } }, required: ["firstId", "secondId"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const pair = input as { firstId?: unknown; secondId?: unknown };
        if (typeof pair.firstId !== "string" || typeof pair.secondId !== "string") throw new Error("firstId and secondId must be person identifiers.");
        if (!engine.people.has(pair.firstId) || !engine.people.has(pair.secondId)) throw new Error("Both identifiers must belong to the open pedigree.");
        if (pair.firstId === pair.secondId) throw new Error("Choose two different people for a comparison.");
        setFirstId(pair.firstId); setSecondId(pair.secondId); setActiveView("compare");
        const result = engine.analyze(pair.firstId, pair.secondId);
        return { firstId: pair.firstId, secondId: pair.secondId, relationship: result.relationship, kinship: result.kinship };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [engine]);

  const selectMatrixPair = (first: PersonId, second: PersonId) => { setFirstId(first); setSecondId(second); setActiveView("compare"); };

  return <div className="app-shell">
    <a className="skip-link" href="#workspace">Skip to main content</a>
    <input accept=".ged,.gedcom,text/plain" aria-label="Import GEDCOM file" hidden onChange={(event) => void importFile(event.target.files?.[0])} ref={fileInput} type="file" />
    <aside className="sidebar">
      <button className="brand" onClick={() => setActiveView("tree")} type="button"><span className="brand__mark" aria-hidden="true">K</span><span>Kinlines</span></button>
      <nav className="sidebar__nav" aria-label="Primary navigation">
        <button aria-current={activeView === "tree" ? "page" : undefined} className={activeView === "tree" ? "active" : ""} onClick={() => setActiveView("tree")} type="button"><GitFork />Family tree</button>
        <button aria-current={activeView === "compare" ? "page" : undefined} className={activeView === "compare" ? "active" : ""} onClick={() => setActiveView("compare")} type="button"><Users />Compare people</button>
        <button aria-current={activeView === "matrix" ? "page" : undefined} className={activeView === "matrix" ? "active" : ""} onClick={() => setActiveView("matrix")} type="button"><Grid3X3 />Relationship matrix</button>
        <button aria-current={activeView === "reports" ? "page" : undefined} className={activeView === "reports" ? "active" : ""} onClick={() => setActiveView("reports")} type="button"><BookOpen />Reports</button>
      </nav>
      {pedigree ? <div className="sidebar__file"><span className="eyebrow">Open archive</span><strong>{pedigree.name}</strong><span>{selectablePeople.length.toLocaleString()} people · local only</span><button onClick={() => fileInput.current?.click()} type="button">Replace GEDCOM</button></div> : <div className="sidebar__file"><span className="eyebrow">No archive open</span><span>Import a GEDCOM or open the sample tree.</span></div>}
    </aside>
    <main className="workspace" id="workspace">
      {!pedigree || !engine || !firstPerson || !secondPerson || !analysis ? <>
        {error && <div className="import-error" role="alert">{error}</div>}
        <EmptyView onImport={() => fileInput.current?.click()} onSample={() => void loadSample()} />
        {isLoadingSample && <p className="loading-message" role="status">Opening sample tree…</p>}
      </> : <>
        <header className="workspace__header"><div><span className="eyebrow">{pedigree.name}</span><h1>{viewLabels[activeView]}</h1></div><div className="workspace__actions"><button className="button" onClick={() => void loadSample()} type="button"><FileJson />Sample tree</button><button className="button button--primary" onClick={() => fileInput.current?.click()} type="button"><FileUp />Import GEDCOM</button></div></header>
        {error && <div className="import-error" role="alert">{error}</div>}
        {activeView === "tree" && <><PersonPickers firstId={firstPerson.id} secondId={secondPerson.id} people={selectablePeople} peopleById={engine.people} onFirst={setFirstId} onSecond={setSecondId} /><div className="analysis-layout"><TreeCanvas people={treePeople} selectedIds={[firstPerson.id, secondPerson.id]} /><RelationshipPanel analysis={analysis} firstPerson={firstPerson} secondPerson={secondPerson} peopleById={engine.people} /></div></>}
        {activeView === "compare" && <section className="compare-view"><PersonPickers firstId={firstPerson.id} secondId={secondPerson.id} people={selectablePeople} peopleById={engine.people} onFirst={setFirstId} onSecond={setSecondId} /><RelationshipPanel analysis={analysis} firstPerson={firstPerson} secondPerson={secondPerson} peopleById={engine.people} /></section>}
        {activeView === "matrix" && <MatrixView engine={engine} firstId={firstPerson.id} secondId={secondPerson.id} people={selectablePeople} onSelectPair={selectMatrixPair} />}
        {activeView === "reports" && <ReportsView engine={engine} people={selectablePeople} />}
      </>}
    </main>
  </div>;
};

export default App;
