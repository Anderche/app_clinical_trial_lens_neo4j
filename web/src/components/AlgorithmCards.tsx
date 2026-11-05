import { useEffect, useMemo, useState } from 'react';
import { loadDetail } from '../lib/data';
import { useViewGraph } from '../lib/graph';
import { useLens, type LensTarget } from '../lib/lens';
import { useStore } from '../lib/store';
import type { Detail } from '../lib/types';
import styles from './AlgorithmCards.module.css';

const toGraph = () => document.getElementById('explore')?.scrollIntoView({ block: 'start' });

function lensProps(key: string, title: string) {
  const t: LensTarget = { keys: [key], params: {}, title };
  return { onMouseEnter: () => useLens.getState().show(t), onMouseLeave: () => useLens.getState().hide() };
}

/** Three live cards; each mini-viz reads graph.json and each button applies its view to the hero graph. */
export function AlgorithmCards() {
  const g = useViewGraph();
  const s = useStore();
  const [similar, setSimilar] = useState<Detail | null>(null);

  const topTargets = useMemo(
    () => (g?.nodes.filter((n) => n.type === 'target') ?? []).sort((a, b) => b.pagerank - a.pagerank).slice(0, 5),
    [g],
  );
  // kNN shows the selected drug, or the top-PageRank bridge drug until something is selected.
  const sel = s.selectedId ? g?.byId.get(s.selectedId) : undefined;
  const fallback = useMemo(() => {
    const drugs = (g?.nodes.filter((n) => n.type === 'drug') ?? []).sort((a, b) => b.pagerank - a.pagerank);
    return (drugs.find((n) => n.bridge) ?? drugs[0])?.id;
  }, [g]);
  const knnId = sel?.type === 'drug' ? sel.id : fallback;
  useEffect(() => {
    if (!knnId) return;
    let live = true;
    loadDetail(knnId).then((d) => live && setSimilar(d)).catch(() => {});
    return () => { live = false; };
  }, [knnId]);

  if (!g) return null;
  const maxPr = topTargets[0]?.pagerank ?? 1;
  const comms = [...g.communities.values()];

  return (
    <div className={styles.grid}>
      <article className={styles.card} {...lensProps('algo.pagerank', 'PageRank → node size')}>
        <span className={styles.call}>gds.pageRank</span>
        <h3>Which targets matter most?</h3>
        <p className={styles.copy}>Ranks every node by how many well-connected drugs and trials point to it. It drives node size in the graph.</p>
        <ol className={styles.bars}>
          {topTargets.map((t) => (
            <li key={t.id} className={`area-${g.communities.get(t.community)?.area ?? t.area}`}>
              <button type="button" onClick={() => { s.select(t.id, true); toGraph(); }}>
                <span className={styles.barLabel}>{t.label}</span>
                <span className={styles.track}><span className={styles.fill} style={{ width: `${(t.pagerank / maxPr) * 100}%` }} /></span>
                <span className={styles.num}>{t.pagerank.toFixed(3)}</span>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className={styles.apply} aria-pressed={s.sizeBy === 'pagerank'}
          onClick={() => { s.set({ sizeBy: s.sizeBy === 'pagerank' ? 'uniform' : 'pagerank' }); toGraph(); }}>
          {s.sizeBy === 'pagerank' ? 'Sizing by PageRank ✓' : 'Size nodes by PageRank'}
        </button>
      </article>

      <article className={styles.card} {...lensProps('algo.louvain', 'Louvain → community colour')}>
        <span className={styles.call}>gds.louvain</span>
        <h3>Which mechanisms move together?</h3>
        <p className={styles.copy}>Finds communities of drugs, targets and conditions, which often cross disease lines.</p>
        <div className={styles.comms}>
          {comms.slice(0, 6).map((c) => {
            const only = s.filters.communities.length === 1 && s.filters.communities[0] === c.id;
            return (
              <div key={c.id} className={`${styles.commCell} area-${c.area} tint-${Math.min(c.tint, 3)}`}>
                <button type="button" className={styles.comm} aria-pressed={s.filters.communities.includes(c.id)}
                  onClick={() => {
                    const on = s.filters.communities;
                    s.setFilters({ communities: on.includes(c.id) ? on.filter((x) => x !== c.id) : [...on, c.id] });
                    toGraph();
                  }}>
                  <span className={styles.commName}>{c.label} <span className={styles.num}>{c.size}</span></span>
                  <span className={styles.commSub}>{c.topTargets.join(' · ')}</span>
                </button>
                <button type="button" className={styles.only} onClick={() => { s.isolate(c.id); toGraph(); }}
                  aria-label={only ? 'Show all communities' : `Show only ${c.label}`}>
                  {only ? 'all' : 'only'}
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" className={styles.apply} aria-pressed={s.colorBy === 'community'}
          onClick={() => { s.set({ colorBy: s.colorBy === 'community' ? 'area' : 'community' }); toGraph(); }}>
          {s.colorBy === 'community' ? 'Coloring by community ✓' : 'Color nodes by community'}
        </button>
      </article>

      <article className={styles.card} {...lensProps('algo.knn', 'FastRP embeddings + kNN')}>
        <span className={styles.call}>gds.fastRP + gds.knn</span>
        <h3>What looks like this drug?</h3>
        <p className={styles.copy}>
          Graph embeddings surface drugs with similar mechanism neighbourhoods, which makes them repurposing candidates.
          {' '}Showing <strong>{similar?.label ?? '…'}</strong>{sel?.type === 'drug' ? '' : '; select a drug to change it'}.
        </p>
        <ul className={styles.sims}>
          {similar?.similar.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => { s.select(x.id, true); toGraph(); }}>
                <span>{x.label}</span><span className={styles.num}>similarity {x.score.toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className={styles.apply} aria-pressed={s.similarFocus && s.selectedId === knnId}
          onClick={() => {
            const on = !(s.similarFocus && s.selectedId === knnId);
            if (on && knnId) s.select(knnId, true);
            s.set({ similarFocus: on });
            toGraph();
          }}>
          {s.similarFocus && s.selectedId === knnId ? 'Highlighting neighbours ✓' : 'Highlight in graph'}
        </button>
      </article>
    </div>
  );
}
