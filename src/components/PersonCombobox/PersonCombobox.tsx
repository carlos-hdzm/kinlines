import { Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PedigreePerson, PersonId } from "../../types/pedigree";
import "./PersonCombobox.css";

type Props = {
  label: string;
  people: readonly PedigreePerson[];
  value?: PersonId;
  excludedId?: PersonId;
  onChange: (id: PersonId) => void;
  peopleById: ReadonlyMap<PersonId, PedigreePerson>;
};

const searchable = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();

const PersonCombobox = ({ label, people, value, excludedId, onChange, peopleById }: Props) => {
  const selected = value ? peopleById.get(value) : undefined;
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const results = useMemo(() => {
    const needle = searchable(query.trim());
    return people.filter((person) => person.id !== excludedId && (!needle
      || searchable(`${person.name} ${person.birthYear ?? ""}`).includes(needle))).slice(0, 12);
  }, [excludedId, people, query]);

  const choose = (person: PedigreePerson) => {
    onChange(person.id);
    setQuery(person.name);
    setOpen(false);
  };

  return <div className="person-combobox" ref={root}>
    <label htmlFor={`${listId}-input`}>{label}</label>
    <div className="person-combobox__control">
      <Search aria-hidden="true" />
      <input
        aria-activedescendant={open && results[activeIndex] ? `${listId}-${results[activeIndex].id}` : undefined}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        autoComplete="off"
        id={`${listId}-input`}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
        onFocus={(event) => { event.currentTarget.select(); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, results.length - 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
          if (event.key === "Enter" && open && results[activeIndex]) { event.preventDefault(); choose(results[activeIndex]); }
          if (event.key === "Escape") { setOpen(false); setQuery(selected?.name ?? ""); }
        }}
        placeholder="Search by name or year"
        role="combobox"
        value={query}
      />
      {query && <button aria-label={`Clear ${label.toLowerCase()}`} onClick={() => { setQuery(""); setOpen(true); }} type="button"><X /></button>}
    </div>
    {open && <div className="person-combobox__results" id={listId} role="listbox">
      {results.length ? results.map((person, index) => {
        const parents = person.parents?.map((id) => peopleById.get(id)?.name ?? id).join(" and ");
        return <button
          aria-selected={person.id === value}
          className={index === activeIndex ? "active" : ""}
          id={`${listId}-${person.id}`}
          key={person.id}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => choose(person)}
          role="option"
          type="button"
        ><strong>{person.name}</strong><span>{[person.birthYear, parents && `Parents: ${parents}`].filter(Boolean).join(" · ") || "No recorded details"}</span></button>;
      }) : <p>No matching people</p>}
    </div>}
  </div>;
};

export default PersonCombobox;
