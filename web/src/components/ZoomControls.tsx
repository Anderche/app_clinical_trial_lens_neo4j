import { Maximize2, Minus, Plus, RotateCcw } from './icons';
import styles from './ZoomControls.module.css';

interface Props {
  onZoom: (action: 'in' | 'out' | 'fit' | 'reset') => void;
}

/** On-canvas zoom buttons; the canvas owns the d3-zoom behaviour and does the work. */
export function ZoomControls({ onZoom }: Props) {
  const buttons = [
    { action: 'in', label: 'Zoom in (+)', Icon: Plus },
    { action: 'out', label: 'Zoom out (−)', Icon: Minus },
    { action: 'fit', label: 'Fit visible nodes (0)', Icon: Maximize2 },
    { action: 'reset', label: 'Reset view', Icon: RotateCcw },
  ] as const;
  return (
    <div className={styles.controls} role="group" aria-label="Zoom">
      {buttons.map(({ action, label, Icon }) => (
        <button key={action} type="button" aria-label={label} title={label}
          onClick={(e) => { e.stopPropagation(); onZoom(action); }}>
          <Icon size={16} aria-hidden />
        </button>
      ))}
    </div>
  );
}
