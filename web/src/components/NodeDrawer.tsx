import { useEffect, useRef, useState } from 'react';
import { loadDetail } from '../lib/data';
import { hueClass, useViewGraph } from '../lib/graph';
import { useStore } from '../lib/store';
import type { Detail } from '../lib/types';
import { AREA_ICON, AREA_LABEL, Building2, Crosshair, FlaskConical, Pill, ShieldCheck, TriangleAlert, X } from './icons';
import { selectFromSearch } from './SearchBox';
import styles from './NodeDrawer.module.css';

const TYPE_ICON = { drug: Pill, target: Crosshair, condition: FlaskConical };
const isRealNct = (id: string) => /^NCT\d{8}$/.test(id);

/** Right-hand panel (bottom sheet on mobile) with trials, FDA status, FAERS terms and similar drugs. */
export function NodeDrawer() {
  const selectedId = useStore((s) => s.selectedId);
  const colorBy = useStore((s) => s.colorBy);
  const select = useStore((s) => s.select);
  const g = useViewGraph();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setError(false);
    if (!selectedId) { setDetail(null); return; }
    let live = true;
    loadDetail(selectedId).then((d) => live && setDetail(d)).catch(() => live && setError(true));
    return () => { live = false; };
  }, [selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && useStore.getState().selectedId) select(null); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [select]);

  if (!selectedId) return null;
  const d = detail?.id === selectedId ? detail : null;
  const node = g?.byId.get(selectedId);
  const Icon = TYPE_ICON[d?.type ?? node?.type ?? 'drug'];
  const community = d ? g?.communities.get(d.community) : undefined;
  const go = (id: string) => void selectFromSearch({ id, inGraph: !!g?.byId.has(id) });

  return (
    <aside className={`${styles.drawer} ${node ? hueClass(node, g, colorBy) : d ? `area-${d.area}` : ''}`} aria-label="Node details">
      <header className={styles.header}>
        <span className={styles.typeIcon}><Icon size={18} aria-hidden /></span>
        <div className={styles.titles}>
          <span className={styles.eyebrow}>{d?.type ?? node?.type}{community ? ` · ${community.label}` : ''}</span>
          <h3>{d?.label ?? node?.label ?? selectedId}</h3>
          {d?.name && d.name !== d.label && <span className={styles.sub}>{d.name}</span>}
        </div>
        <button ref={closeRef} type="button" className={styles.close} onClick={() => select(null)} aria-label="Close details"><X size={18} /></button>
      </header>

      {error && <p className={styles.muted}>Could not load details.</p>}
      {!d && !error && <p className={styles.muted}>Loading…</p>}
      {d && (
        <div className={styles.body}>
          <div className={styles.row}>
            {d.areas.map((a) => {
              const A = AREA_ICON[a];
              return <span key={a} className={`${styles.chip} area-${a}`}><A size={14} aria-hidden /> {AREA_LABEL[a]}</span>;
            })}
            <span className={`${styles.chip} mono`}>pagerank {d.pagerank.toFixed(4)}</span>
          </div>
          {d.moa && <p className={styles.moa}>{d.moa}</p>}

          {d.type === 'drug' && (
            <section>
              <h4>FDA status</h4>
              {d.fda?.status === 'approved' ? (
                <p className={styles.fda}><ShieldCheck size={16} className={styles.ok} aria-hidden />
                  Approved{d.fda.brand ? ` as ${d.fda.brand}` : ''}{d.fda.approved ? ` · ${d.fda.approved}` : ''}</p>
              ) : <p className={styles.muted}>Investigational — no FDA approval found.</p>}
              {d.fda?.actions.filter((a) => a.label !== 'Original approval').map((a) => (
                <p key={a.date + a.label} className={styles.action}><span className="mono">{a.date}</span> {a.label}</p>
              ))}
            </section>
          )}

          {d.type === 'drug' && d.faers.length > 0 && (
            <section>
              <h4>{d.faers[0].count === null ? 'Label-listed reactions' : 'Top FAERS reactions'}</h4>
              <div className={styles.row}>
                {d.faers.map((f) => (
                  <span key={f.term} className={`${styles.chip} ${styles.warn}`}>
                    <TriangleAlert size={13} aria-hidden /> {f.term}{f.count !== null && <span className="mono"> {f.count.toLocaleString()}</span>}
                  </span>
                ))}
              </div>
              {d.faers[0].count !== null && <p className={styles.fine}>Raw FAERS report counts; not a measure of causation or risk.</p>}
            </section>
          )}

          <section>
            <h4>Trials <span className={styles.count}>{d.trialCount}</span></h4>
            <ul className={styles.trials}>
              {d.trials.map((t) => (
                <li key={t.nct}>
                  <FlaskConical size={14} aria-hidden className={styles.flask} />
                  <div>
                    {isRealNct(t.nct)
                      ? <a className="mono" href={`https://clinicaltrials.gov/study/${t.nct}`} target="_blank" rel="noreferrer">{t.nct}</a>
                      : <span className="mono">{t.nct}</span>}
                    <span className={styles.meta}> · Phase {t.phase} · {t.start}</span>
                    <div className={styles.meta}><Building2 size={12} aria-hidden /> {t.sponsor} · {t.conditions.join(', ')}</div>
                  </div>
                </li>
              ))}
            </ul>
            {d.trialCount > d.trials.length && <p className={styles.fine}>Showing {d.trials.length} most recent of {d.trialCount}.</p>}
          </section>

          {d.similar.length > 0 && (
            <section>
              <h4>Similar drugs <span className={styles.badge}>FastRP + kNN</span></h4>
              <ul className={styles.links}>
                {d.similar.map((s) => (
                  <li key={s.id}><button type="button" onClick={() => go(s.id)}>{s.label}<span className="mono">{s.score.toFixed(2)}</span></button></li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h4>{d.type === 'drug' ? 'Targets & conditions' : d.type === 'target' ? 'Drugs hitting this target' : 'Drugs tested'}</h4>
            <ul className={styles.links}>
              {d.neighbors.map((n) => (
                <li key={n.id}><button type="button" onClick={() => go(n.id)}>{n.label}<span className={styles.meta}>{n.rel === 'TARGETS' ? 'targets' : 'tested in'}</span></button></li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </aside>
  );
}
