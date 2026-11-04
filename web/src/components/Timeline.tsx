import { useStore } from '../lib/store';
import styles from './Timeline.module.css';

const LABEL_W = 190;
const W = 960;
const LANE_H = 44;
const TOP = 28;

/** Static SVG of trial-start-to-FDA-action lanes, drawn from the pipeline's timeline.json. */
export function Timeline() {
  const lanes = useStore((s) => s.data?.timeline);
  const years = useStore((s) => s.data?.meta.years) ?? [2023, 2026];
  if (!lanes?.length) return null;

  const span = years[1] + 1 - years[0];
  const x = (t: number) => LABEL_W + ((t - years[0]) / span) * (W - LABEL_W - 8);
  const dateX = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return x(y + (m - 1) / 12 + (d - 1) / 365);
  };
  const H = TOP + lanes.length * LANE_H + 4;
  const ticks = Array.from({ length: span }, (_, i) => years[0] + i);

  return (
    <figure className={styles.figure}>
      <div className={styles.scroll}>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img"
          aria-label={`Timeline of ${lanes.length} drugs from first trial start to FDA actions, ${years[0]}–${years[1]}`}>
          {ticks.map((y) => (
            <g key={y}>
              <line x1={x(y)} x2={x(y)} y1={TOP - 8} y2={H} className={styles.grid} />
              <text x={x(y) + 6} y={14} className={styles.tick}>{y}</text>
            </g>
          ))}
          {lanes.map((l, i) => {
            const y = TOP + i * LANE_H;
            return (
              <g key={l.id} className={`area-${l.area}`}>
                <text x={0} y={y + 20} className={styles.drug}>{l.label}</text>
                {l.brand && <text x={0} y={y + 35} className={styles.brand}>{l.brand}</text>}
                <rect x={LABEL_W} y={y + 6} width={W - LABEL_W - 8} height={28} rx={4} className={styles.track} />
                <rect x={x(l.start)} y={y + 12} width={x(l.end + 1) - x(l.start)} height={16} rx={3} className={styles.bar}>
                  <title>{`${l.label}: ${l.trialCount} trials since ${l.start}`}</title>
                </rect>
                {l.actions.map((a) => (
                  <g key={a.date + a.label}>
                    <line x1={dateX(a.date)} x2={dateX(a.date)} y1={y + 2} y2={y + 38} className={styles.action} />
                    <circle cx={dateX(a.date)} cy={y + 4} r={3.5} className={styles.actionDot}>
                      <title>{`${a.date} · ${a.label}`}</title>
                    </circle>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className={styles.legend}>
        <span><span className={styles.swatchBar} />Active trials (first start → today)</span>
        <span><span className={styles.swatchAction} />FDA action (openFDA)</span>
      </figcaption>
    </figure>
  );
}
