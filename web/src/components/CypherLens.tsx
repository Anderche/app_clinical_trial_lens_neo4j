import { Fragment, useEffect, useRef, useState } from 'react';
import { fillTemplate, useLens } from '../lib/lens';
import { useStore } from '../lib/store';
import { Copy, X } from './icons';
import styles from './CypherLens.module.css';

const HOVER_DELAY = 250;
const LONG_PRESS = 500;

/** Highlight labels and relationship types (`:Drug`, `[:TARGETS]`) in --accent. */
function highlight(code: string) {
  return code.split(/(:[A-Z][A-Za-z_]*|'[^']*')/g).map((part, i) =>
    part.startsWith(':') ? <span key={i} className={styles.label}>{part}</span>
      : part.startsWith("'") ? <span key={i} className={styles.str}>{part}</span>
        : <Fragment key={i}>{part}</Fragment>);
}

/** One shared tooltip: hover any node, edge or algorithm card to see the Cypher behind it. */
export function CypherLens() {
  const target = useLens((s) => s.target);
  const pinned = useLens((s) => s.pinned);
  const cypher = useStore((s) => s.data?.cypher);
  const engine = useStore((s) => s.data?.meta.engine);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const { x, y } = pos.current;
    const w = el.offsetWidth, h = el.offsetHeight;
    const left = x + 16 + w > innerWidth - 8 ? x - w - 16 : x + 16;
    const top = y + 18 + h > innerHeight - 8 ? y - h - 12 : y + 18;
    el.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  };

  // Follow the cursor (unless pinned).
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (useLens.getState().pinned) return;
      pos.current = { x: e.clientX, y: e.clientY };
      place();
    };
    const scroll = () => useLens.getState().hide();   // no mouseleave fires when the page scrolls away
    addEventListener('pointermove', move, { passive: true });
    addEventListener('scroll', scroll, { passive: true });
    return () => { removeEventListener('pointermove', move); removeEventListener('scroll', scroll); };
  }, []);

  // 250 ms hover delay.
  useEffect(() => {
    setCopied(false);
    if (!target) { setVisible(false); return; }
    const t = setTimeout(() => setVisible(true), pinned ? 0 : HOVER_DELAY);
    return () => clearTimeout(t);
  }, [target, pinned]);

  useEffect(() => { if (visible) place(); }, [visible, target]);

  // C pins, Esc unpins; long-press opens it on touch.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, textarea, select')) return;
      const s = useLens.getState();
      if (e.key.toLowerCase() === 'c' && s.target && !e.metaKey && !e.ctrlKey) s.setPinned(!s.pinned);
      if (e.key === 'Escape' && s.pinned) s.setPinned(false);
    };
    let timer = 0;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pos.current = { x: e.clientX, y: e.clientY };
      timer = window.setTimeout(() => { if (useLens.getState().target) useLens.getState().setPinned(true); }, LONG_PRESS);
    };
    const up = () => clearTimeout(timer);
    addEventListener('keydown', key);
    addEventListener('pointerdown', down);
    addEventListener('pointerup', up);
    return () => { removeEventListener('keydown', key); removeEventListener('pointerdown', down); removeEventListener('pointerup', up); };
  }, []);

  if (!target || !cypher) return null;
  const code = target.keys.map((k) => cypher[k]).filter(Boolean).map((tpl) => fillTemplate(tpl, target.params)).join('\n\n');

  const copy = async () => {
    await navigator.clipboard?.writeText(code);
    setCopied(true);
  };

  return (
    <div ref={ref} role="tooltip" className={`${styles.lens} ${visible ? styles.visible : ''} ${pinned ? styles.pinned : ''}`}>
      <div className={styles.head}>
        <span className={styles.badge}>Neo4j · Cypher</span>
        {pinned ? (
          <span className={styles.actions}>
            <button type="button" onClick={copy} aria-label="Copy query"><Copy size={14} /> {copied ? 'Copied' : 'Copy'}</button>
            <button type="button" onClick={() => useLens.getState().setPinned(false)} aria-label="Close"><X size={14} /></button>
          </span>
        ) : <span className={styles.hint}>press C to pin</span>}
      </div>
      <div className={styles.title}>{target.title}</div>
      {target.subtitle && <div className={styles.subtitle}>{target.subtitle}</div>}
      {code && <pre className={styles.code}>{highlight(code)}</pre>}
      {engine && engine !== 'neo4j-gds' && (
        <div className={styles.note}>Template from pipeline/cypher.py; this build used the local engine.</div>
      )}
    </div>
  );
}
