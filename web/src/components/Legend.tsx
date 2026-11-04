import { useViewGraph } from '../lib/graph';
import { useStore } from '../lib/store';
import styles from './Legend.module.css';

/** Shapes, community colours and the dashed bridge style (with its toggle). */
export function Legend() {
  const g = useViewGraph();
  const showBridges = useStore((s) => s.showBridges);
  const colorBy = useStore((s) => s.colorBy);
  const set = useStore((s) => s.set);
  const setFilters = useStore((s) => s.setFilters);
  const community = useStore((s) => s.filters.community);

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
        <div className={styles.communities} role="group" aria-label="Louvain communities (click to filter)">
          {[...(g?.communities.values() ?? [])].map((c) => (
            <button key={c.id} type="button" className={`${styles.comm} area-${c.area} tint-${Math.min(c.tint, 3)}`}
              aria-pressed={community === c.id} onClick={() => setFilters({ community: community === c.id ? null : c.id })}>
              <span className={styles.swatch} aria-hidden />{c.label}
            </button>
          ))}
        </div>
      )}
      <span className={styles.algo}>gds.louvain · gds.pageRank</span>
    </div>
  );
}
