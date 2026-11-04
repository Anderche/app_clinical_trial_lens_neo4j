import { useMemo, useState } from 'react';
import { useViewGraph } from '../lib/graph';
import { useLens } from '../lib/lens';
import { useStore } from '../lib/store';
import { AREA_ICON, AREA_LABEL, ChevronDown } from './icons';
import styles from './BridgesPanel.module.css';

/** Repurposing bridges: drugs with trials in two or more disease areas, most areas first. */
export function BridgesPanel() {
  const g = useViewGraph();
  const selectedId = useStore((s) => s.selectedId);
  const [open, setOpen] = useState(false);
  const bridges = useMemo(
    () => (g?.nodes.filter((n) => n.bridge) ?? []).sort((a, b) => b.areas.length - a.areas.length || b.pagerank - a.pagerank),
    [g],
  );
  if (!bridges.length) return null;

  return (
    <div className={styles.panel}>
      <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={styles.dash} aria-hidden /> Bridges <span className={styles.count}>{bridges.length}</span>
        <ChevronDown size={14} aria-hidden className={open ? styles.up : ''} />
      </button>
      {open && (
        <ul className={styles.list}>
          {bridges.map((b) => (
            <li key={b.id}>
              <button type="button" aria-pressed={selectedId === b.id}
                onClick={() => useStore.getState().select(b.id, true)}
                onMouseEnter={() => useLens.getState().show({ keys: ['bridge'], params: { label: b.label }, title: b.label, subtitle: `${b.areas.length} disease areas` })}
                onMouseLeave={() => useLens.getState().hide()}>
                <span className={styles.name}>{b.label}</span>
                <span className={styles.areas}>
                  {b.areas.map((a) => {
                    const Icon = AREA_ICON[a];
                    return <span key={a} className={`area-${a}`} title={AREA_LABEL[a]}><Icon size={14} aria-label={AREA_LABEL[a]} /></span>;
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
