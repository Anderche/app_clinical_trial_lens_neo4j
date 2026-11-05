import { useState, type KeyboardEvent } from 'react';
import { useStore } from '../lib/store';
import type { Lane } from '../lib/types';
import { AREA_LABEL, AREAS } from './icons';
import styles from './Timeline.module.css';

const LABEL_W = 190;
const W = 960;
const HEAD = 30;
const GROUP_H = 26;
const LANE_H = 60;
const DEFAULT_HINT = 'Tap a block or diamond for details, or a drug name to open it in the graph.';

/** Opacity ramp for trial phase: lighter is earlier, solid is Phase 4. */
const PHASE_OPACITY: Record<number, number> = { 0: 0.25, 1: 0.35, 2: 0.55, 3: 0.8, 4: 1 };
const phaseOpacity = (p: number) => PHASE_OPACITY[p] ?? 0.25;

/** Click or Enter/Space, so SVG shapes work for touch and keyboard users as well as hover. */
const press = (fn: () => void) => ({
  role: 'button' as const,
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  },
});

const firstAction = (l: Lane) => l.actions.map((a) => a.date).sort()[0] ?? '9999';

/** Lanes grouped by disease area, earliest FDA action first within each group. */
function grouped(lanes: Lane[]) {
  return AREAS.map((area) => ({
    area,
    lanes: lanes.filter((l) => l.area === area).sort((a, b) => firstAction(a).localeCompare(firstAction(b))),
  })).filter((g) => g.lanes.length);
}

/** Trial starts (one block per year) and FDA actions (diamonds) per headline drug, from timeline.json. */
export function Timeline() {
  const lanes = useStore((s) => s.data?.timeline);
  const years = useStore((s) => s.data?.meta.years) ?? [2023, 2026];
  const select = useStore((s) => s.select);
  const [readout, setReadout] = useState(DEFAULT_HINT);
  if (!lanes?.length) return null;

  const span = years[1] + 1 - years[0];
  const x = (t: number) => LABEL_W + ((t - years[0]) / span) * (W - LABEL_W - 8);
  const dateX = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return x(y + (m - 1) / 12 + (d - 1) / 365);
  };
  const now = new Date();
  const today = Math.min(Math.max(now.getFullYear() + now.getMonth() / 12 + now.getDate() / 365, years[0]), years[1] + 1);
  const todayX = x(today);

  const groups = grouped(lanes);
  const H = HEAD + groups.length * GROUP_H + lanes.length * LANE_H + 4;
  const ticks = Array.from({ length: span }, (_, i) => years[0] + i);

  const openInGraph = (id: string) => {
    select(id, true);
    document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth' });
  };

  let cursor = HEAD;
  const rows = groups.map((g) => {
    const headY = cursor;
    cursor += GROUP_H;
    const laneRows = g.lanes.map((l) => {
      const y = cursor;
      cursor += LANE_H;
      return { l, y };
    });
    return { area: g.area, headY, laneRows };
  });

  return (
    <figure className={styles.figure}>
      <div className={styles.scroll}>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="group"
          aria-label={`Timeline of ${lanes.length} drugs: trial starts per year and FDA actions, ${years[0]}–${years[1]}`}>
          {ticks.map((y) => (
            <g key={y}>
              <line x1={x(y)} x2={x(y)} y1={HEAD - 8} y2={H} className={styles.grid} />
              <text x={x(y) + 6} y={14} className={styles.tick}>{y}</text>
            </g>
          ))}

          {rows.map(({ area, headY, laneRows }) => (
            <g key={area} className={`area-${area}`}>
              <text x={0} y={headY + 17} className={styles.group}>{AREA_LABEL[area]}</text>
              <line x1={0} x2={W - 8} y1={headY + 22} y2={headY + 22} className={styles.groupRule} />

              {laneRows.map(({ l, y }) => (
                <g key={l.id}>
                  <text x={0} y={y + 27} className={`${styles.drug} ${styles.link}`}
                    {...press(() => openInGraph(l.id))}>
                    {l.label}
                    <title>{`Open ${l.label} in the graph`}</title>
                  </text>
                  {l.brand && <text x={0} y={y + 43} className={styles.brand}>{l.brand}</text>}
                  <rect x={LABEL_W} y={y + 18} width={W - LABEL_W - 8} height={26} rx={4} className={styles.track} />

                  {l.byYear.map((b) => {
                    const bx = x(b.year) + 1;
                    const bw = x(b.year + 1) - x(b.year) - 2;
                    const text = `${l.label} · ${b.year}: ${b.n} trial${b.n === 1 ? '' : 's'} started, highest phase ${b.phase || 'n/a'}`;
                    return (
                      <g key={b.year} {...press(() => setReadout(text))} aria-label={text} className={styles.hit}>
                        <rect x={bx} y={y + 22} width={bw} height={18} rx={3} className={styles.block}
                          style={{ opacity: phaseOpacity(b.phase) }} />
                        <text x={bx + bw / 2} y={y + 34.5} textAnchor="middle"
                          className={b.phase >= 2 ? styles.countOn : styles.count}>{b.n}</text>
                        <title>{text}</title>
                      </g>
                    );
                  })}

                  {l.actions.map((a, i) => {
                    const ax = dateX(a.date);
                    const above = i % 2 === 0;
                    const text = `${l.label} · ${a.date} · FDA: ${a.label}`;
                    return (
                      <g key={a.date + a.label} {...press(() => setReadout(text))} aria-label={text} className={styles.hit}>
                        <line x1={ax} x2={ax} y1={above ? y + 15 : y + 38} y2={above ? y + 31 : y + 48} className={styles.stem} />
                        <path d={`M${ax} ${y + 25}l6 6-6 6-6-6z`} className={styles.diamond} />
                        <text x={ax} y={above ? y + 12 : y + 58} textAnchor={ax > W - 170 ? 'end' : 'start'}
                          dx={ax > W - 170 ? 6 : -6} className={styles.actionLabel}>{a.label}</text>
                        <title>{text}</title>
                      </g>
                    );
                  })}
                </g>
              ))}
            </g>
          ))}

          <line x1={todayX} x2={todayX} y1={HEAD - 8} y2={H} className={styles.today} />
          <text x={todayX - 4} y={14} textAnchor="end" className={styles.todayLabel}>Today</text>
        </svg>
      </div>
      <p className={styles.readout} aria-live="polite">{readout}</p>
      <figcaption className={styles.legend}>
        <span>
          <span className={styles.ramp} aria-hidden>
            {[1, 2, 3, 4].map((p) => <i key={p} style={{ opacity: phaseOpacity(p) }}>{p}</i>)}
          </span>
          Block = one start year; number = trials started; shade = highest phase
        </span>
        <span><span className={styles.swatchDiamond} />FDA action (openFDA)</span>
        <span><span className={styles.swatchToday} />Today</span>
      </figcaption>
    </figure>
  );
}
