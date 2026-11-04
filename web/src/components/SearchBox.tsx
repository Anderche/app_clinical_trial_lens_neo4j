import { useEffect, useId, useRef, useState } from 'react';
import type Fuse from 'fuse.js';
import { loadDetail, loadSearchIndex } from '../lib/data';
import { useStore } from '../lib/store';
import type { SearchItem } from '../lib/types';
import { Search } from './icons';
import styles from './SearchBox.module.css';

let fusePromise: Promise<Fuse<SearchItem>> | null = null;
// Fuse.js and the index load on first focus, keeping them out of the initial bundle.
const getFuse = () => (fusePromise ??= Promise.all([import('fuse.js'), loadSearchIndex()]).then(
  ([{ default: FuseCtor }, items]) => new FuseCtor(items, { keys: ['label', 'alt', 'id'], threshold: 0.3, ignoreLocation: true }),
));

export async function selectFromSearch(item: Pick<SearchItem, 'id' | 'inGraph'>) {
  const { addExtra, select } = useStore.getState();
  if (!item.inGraph) addExtra(await loadDetail(item.id));   // drug beyond the 500-node cap: pull in it and its neighbours
  select(item.id, true);
}

export function SearchBox() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  // "/" focuses search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target as HTMLElement).matches('input, textarea, select')) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    let live = true;
    getFuse().then((f) => live && (setResults(f.search(q, { limit: 8 }).map((r) => r.item)), setActive(0)));
    return () => { live = false; };
  }, [q]);

  const choose = (item: SearchItem) => {
    setQ(''); setOpen(false); input.current?.blur();
    void selectFromSearch(item);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) choose(results[active]);
    else if (e.key === 'Escape') { setQ(''); input.current?.blur(); }
  };

  const showList = open && results.length > 0;
  return (
    <div className={styles.wrap}>
      <Search size={16} className={styles.icon} aria-hidden />
      <input ref={input} type="search" className={styles.input} placeholder="Search drugs, targets…  /"
        value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => { setOpen(true); void getFuse(); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKeyDown}
        role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined} aria-label="Search the graph" />
      {showList && (
        <ul id={listId} role="listbox" className={styles.list}>
          {results.map((r, i) => (
            <li key={r.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={`${styles.option} area-${r.area}`} onMouseDown={(e) => { e.preventDefault(); choose(r); }}>
              <span className={styles.dot} data-type={r.type} />
              <span className={styles.name}>{r.label}</span>
              <span className={styles.type}>{r.type}{r.inGraph ? '' : ' · loads on demand'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
