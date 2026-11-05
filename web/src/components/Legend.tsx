import { useViewGraph, visibleIds } from '../lib/graph';
import { useStore } from '../lib/store';
import styles from './Legend.module.css';

/** Shapes, community colours and the dashed bridge style (with its toggle). */
export function Legend() {
  const g = useViewGraph();
  const showBridges = useStore((s) => s.showBridges);
  const colorBy = useStore((s) => s.colorBy);
  const isolateMode = useStore((s) => s.isolateMode);
  const filters = useStore((s) => s.filters);
  const { set, setFilters, isolate, requestFit } = useStore.getState();
  const selected = filters.communities;
  const toggle = (id: number) => setFilters({ communities: selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id] });
  const filtered = !!g && visibleIds(g, filters) !== null;

  return (
    <div className={styles.legend}>
      <div className={styles.shapes} aria-label="Node shapes">
        <span><svg width="16" height="16" aria-hidden><circle cx="8" cy="8" r="7" className={styles.target} /></svg>Target</span>
        <span><svg width="16" height="16" aria-hidden><circle cx="8" cy="8" r="6" className={styles.drug} /></svg>Drug</span>
        <span><svg width="16" height="16" aria-hidden><rect x="1.5" y="1.5" width="13" height="13" rx="4" className={styles.condition} /></svg>Condition</span>
        <label className={styles.toggle}>
          <input type="checkbox" checked={showBridges} onChange={(e) => set({ showBridges: e.target.checked })} />
          <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" className={styles.bridge} /></svg>
          Show bridges
        </label>
      </div>
      {colorBy === 'community' && (
        <div className={styles.communities} role="group" aria-label="Louvain communities (select one or more to filter)">
          {[...(g?.communities.values() ?? [])].map((c) => {
            const on = selected.includes(c.id);
            const only = on && selected.length === 1;
            return (
              <span key={c.id} className={`${styles.comm} ${on ? styles.on : ''} area-${c.area} tint-${Math.min(c.tint, 3)}`}>
                <button type="button" className={styles.commToggle} aria-pressed={on} onClick={() => toggle(c.id)}>
                  <span className={styles.swatch} aria-hidden />{c.label}
                </button>
                <button type="button" className={styles.only} onClick={() => isolate(c.id)}
                  aria-label={only ? 'Show all communities' : `Show only ${c.label}`}>
                  {only ? 'all' : 'only'}
                </button>
              </span>
            );
          })}
          {selected.length > 0 && (
            <button type="button" className={styles.clear} onClick={() => { setFilters({ communities: [] }); requestFit(); }}>Clear</button>
          )}
        </div>
      )}
      {filtered && (
        <div className={styles.mode} role="group" aria-label="Nodes outside the filter">
          {(['fade', 'hide'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={isolateMode === m} onClick={() => set({ isolateMode: m })}>
              {m === 'fade' ? 'Fade others' : 'Hide others'}
            </button>
          ))}
        </div>
      )}
      <span className={styles.algo}>gds.louvain · gds.pageRank</span>
    </div>
  );
}
