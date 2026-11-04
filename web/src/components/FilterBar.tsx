import { useMemo } from 'react';
import { useViewGraph } from '../lib/graph';
import { DEFAULT_YEARS, emptyFilters, useStore } from '../lib/store';
import type { Phase } from '../lib/types';
import { AREA_ICON, AREA_LABEL, AREAS, ChevronDown } from './icons';
import { SearchBox } from './SearchBox';
import styles from './FilterBar.module.css';

const PHASES: [Phase, string][] = [
  ['phase1', 'Phase 1'], ['phase2', 'Phase 2'], ['phase3', 'Phase 3'], ['phase4', 'Phase 4'], ['approved', 'FDA approved'],
];
const YEARS = Array.from({ length: DEFAULT_YEARS[1] - DEFAULT_YEARS[0] + 1 }, (_, i) => DEFAULT_YEARS[0] + i);

export function FilterBar() {
  const g = useViewGraph();
  const f = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const reset = useStore((s) => s.resetFilters);
  const sponsors = useMemo(
    () => [...new Set(g?.nodes.flatMap((n) => n.sponsors ?? []) ?? [])].sort((a, b) => a.localeCompare(b)),
    [g],
  );
  const dirty = JSON.stringify(f) !== JSON.stringify(emptyFilters());
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className={styles.bar} role="group" aria-label="Graph filters">
      <SearchBox />

      <div className={styles.chips} role="group" aria-label="Disease areas">
        {AREAS.map((a) => {
          const Icon = AREA_ICON[a];
          return (
            <button key={a} type="button" className={`${styles.chip} area-${a}`} aria-pressed={f.areas.includes(a)}
              onClick={() => setFilters({ areas: toggle(f.areas, a) })}>
              <Icon size={16} aria-hidden /> {AREA_LABEL[a]}
            </button>
          );
        })}
      </div>

      <details className={styles.menu}>
        <summary>Phase{f.phases.length ? ` (${f.phases.length})` : ''} <ChevronDown size={14} aria-hidden /></summary>
        <fieldset className={styles.popover}>
          <legend className="sr-only">Highest phase reached</legend>
          {PHASES.map(([p, label]) => (
            <label key={p}>
              <input type="checkbox" checked={f.phases.includes(p)} onChange={() => setFilters({ phases: toggle(f.phases, p) })} />
              {label}
            </label>
          ))}
        </fieldset>
      </details>

      <label className={styles.field}>
        <span>Start</span>
        <select value={f.years[0]} aria-label="Start year from"
          onChange={(e) => setFilters({ years: [Number(e.target.value), Math.max(Number(e.target.value), f.years[1])] })}>
          {YEARS.map((y) => <option key={y}>{y}</option>)}
        </select>
        <span aria-hidden>–</span>
        <select value={f.years[1]} aria-label="Start year to"
          onChange={(e) => setFilters({ years: [Math.min(f.years[0], Number(e.target.value)), Number(e.target.value)] })}>
          {YEARS.map((y) => <option key={y}>{y}</option>)}
        </select>
      </label>

      <details className={styles.menu}>
        <summary>Community{f.communities.length ? ` (${f.communities.length})` : ''} <ChevronDown size={14} aria-hidden /></summary>
        <fieldset className={styles.popover}>
          <legend className="sr-only">Louvain communities</legend>
          {[...(g?.communities.values() ?? [])].map((c) => (
            <label key={c.id}>
              <input type="checkbox" checked={f.communities.includes(c.id)}
                onChange={() => setFilters({ communities: toggle(f.communities, c.id) })} />
              {c.label} ({c.size})
            </label>
          ))}
        </fieldset>
      </details>

      <label className={styles.field}>
        <span className="sr-only">Sponsor</span>
        <input type="search" list="sponsor-list" placeholder="Sponsor…" value={f.sponsor}
          onChange={(e) => setFilters({ sponsor: e.target.value })} className={styles.sponsor} />
        <datalist id="sponsor-list">{sponsors.map((s) => <option key={s} value={s} />)}</datalist>
      </label>

      {dirty && <button type="button" className={styles.reset} onClick={reset}>Reset</button>}
    </div>
  );
}
