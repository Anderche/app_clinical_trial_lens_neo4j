import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { drag } from 'd3-drag';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationNodeDatum } from 'd3-force';
import { scaleSqrt } from 'd3-scale';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { loadDetail } from '../lib/data';
import { hueClass, useViewGraph, visibleIds, type ViewGraph } from '../lib/graph';
import { useLens } from '../lib/lens';
import { useStore } from '../lib/store';
import type { GNode } from '../lib/types';
import { AREA_ICON, Crosshair, Pill } from './icons';
import styles from './NetworkCanvas.module.css';
import { ZoomControls } from './ZoomControls';

interface SimNode extends SimulationNodeDatum {
  id: string;
  r: number;
  x0: number;
  y0: number;
}

const KEY_DRUG_LABELS = 14; // the top-PageRank drugs keep their labels at every zoom level
const ZOOM_STEP = 1.4;

function useRadius(g: ViewGraph | null, sizeBy: 'pagerank' | 'uniform') {
  return useMemo(() => {
    const scale = (type: GNode['type'], range: [number, number]) => {
      const prs = g?.nodes.filter((n) => n.type === type).map((n) => n.pagerank) ?? [0];
      return scaleSqrt().domain([Math.min(...prs), Math.max(...prs)]).range(range).clamp(true);
    };
    const target = scale('target', [8, 24]);
    const drug = scale('drug', [7, 16]);
    return (n: GNode) => {
      if (n.type === 'condition') return 12;
      if (sizeBy === 'uniform') return n.type === 'target' ? 12 : 9;
      return n.type === 'target' ? target(n.pagerank) : drug(n.pagerank);
    };
  }, [g, sizeBy]);
}

function lensFor(n: GNode) {
  const meta = n.type === 'drug'
    ? [n.maxPhase === 'approved' ? 'FDA approved' : n.maxPhase?.replace('phase', 'Phase '), n.bridge ? `bridge · ${n.areas.length} areas` : null]
    : [n.type === 'target' ? 'Target' : 'Condition'];
  return {
    keys: [`node.${n.type}`, ...(n.bridge ? ['bridge'] : [])],
    params: { label: n.label },
    title: n.label,
    subtitle: [...meta, `PageRank ${n.pagerank.toFixed(4)}`].filter(Boolean).join(' · '),
  };
}

export function NetworkCanvas() {
  const g = useViewGraph();
  const sizeBy = useStore((s) => s.sizeBy);
  const colorBy = useStore((s) => s.colorBy);
  const showBridges = useStore((s) => s.showBridges);
  const centerOn = useStore((s) => s.centerOn);
  const similarFocus = useStore((s) => s.similarFocus);
  const selectedId = useStore((s) => s.selectedId);
  const isolateMode = useStore((s) => s.isolateMode);
  const fitRequest = useStore((s) => s.fitRequest);
  const radius = useRadius(g, sizeBy);

  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<SVGGElement>(null);
  const linksRef = useRef<SVGGElement>(null);
  const simNodes = useRef(new Map<string, SimNode>());
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>();
  const fitted = useRef(false);
  const initialView = useRef<ZoomTransform>();
  const [similarIds, setSimilarIds] = useState<string[]>([]);
  const reducedMotion = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  const keyDrugs = useMemo(
    () => new Set(g?.nodes.filter((n) => n.type === 'drug').sort((a, b) => b.pagerank - a.pagerank).slice(0, KEY_DRUG_LABELS).map((n) => n.id)),
    [g],
  );

  // ---- zoom + pan (set up once) ----
  useEffect(() => {
    const svg = svgRef.current!;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (e) => {
        viewRef.current?.setAttribute('transform', e.transform.toString());
        svg.classList.toggle('is-zoomed', e.transform.k >= 1.6);
      });
    zoomRef.current = z;
    select(svg).call(z).on('dblclick.zoom', null);
  }, []);

  /** Frame the given nodes (all when null), using their current simulated positions. */
  const fitTo = useCallback((ids: Set<string> | null, animate = true, maxK = 1.6) => {
    const svg = svgRef.current, z = zoomRef.current;
    const pts = [...simNodes.current.values()].filter((n) => !ids || ids.has(n.id));
    if (!svg || !z || !pts.length) return undefined;
    const xs = pts.map((n) => n.x!), ys = pts.map((n) => n.y!);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const { width, height } = svg.getBoundingClientRect();
    const k = Math.min(width / (x1 - x0 + 120), height / (y1 - y0 + 120), maxK);
    const t = zoomIdentity.translate(width / 2 - k * (x0 + x1) / 2, height / 2 - k * (y0 + y1) / 2).scale(k);
    if (animate && !reducedMotion) select(svg).transition().duration(500).call(z.transform, t);
    else select(svg).call(z.transform, t);
    return t;
  }, [reducedMotion]);

  const onZoom = useCallback((action: 'in' | 'out' | 'fit' | 'reset') => {
    const svg = svgRef.current, z = zoomRef.current;
    if (!svg || !z) return;
    const tr = select(svg).transition().duration(reducedMotion ? 0 : 250);
    if (action === 'in') tr.call(z.scaleBy, ZOOM_STEP);
    else if (action === 'out') tr.call(z.scaleBy, 1 / ZOOM_STEP);
    else if (action === 'fit') fitTo(g ? visibleIds(g, useStore.getState().filters) : null);
    else if (initialView.current) tr.call(z.transform, initialView.current);
  }, [g, fitTo, reducedMotion]);

  const onKey = (e: KeyboardEvent) => {
    const action = ({ '+': 'in', '=': 'in', '-': 'out', '_': 'out', '0': 'fit' } as const)[e.key as '+'];
    if (!action) return;
    e.preventDefault();
    onZoom(action);
  };

  // ---- fit on request (isolating a community, clearing it) ----
  useEffect(() => {
    if (fitRequest && g) fitTo(visibleIds(g, useStore.getState().filters));
  }, [fitRequest]); // only a new request refits, not every graph or filter change

  // ---- layout: precomputed x/y, then a short settle; drag pins a node ----
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!g || !svg) return;
    const prev = simNodes.current;
    const nodes: SimNode[] = g.nodes.map((n) => {
      const p = prev.get(n.id);
      return { id: n.id, r: radius(n), x0: n.x, y0: n.y, x: p?.x ?? n.x, y: p?.y ?? n.y, fx: p?.fx, fy: p?.fy };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    simNodes.current = byId;

    const nodeEls = [...svg.querySelectorAll<SVGGElement>('g[data-id]')].map((el) => ({ el, n: byId.get(el.dataset.id!)! }));
    const lineEls = [...svg.querySelectorAll<SVGLineElement>('line[data-s]')].map((el) => ({
      el, s: byId.get(el.dataset.s!)!, t: byId.get(el.dataset.t!)!,
    }));
    const paint = () => {
      for (const { el, n } of nodeEls) el.setAttribute('transform', `translate(${n.x!.toFixed(1)},${n.y!.toFixed(1)})`);
      for (const { el, s, t } of lineEls) {
        el.setAttribute('x1', s.x!.toFixed(1)); el.setAttribute('y1', s.y!.toFixed(1));
        el.setAttribute('x2', t.x!.toFixed(1)); el.setAttribute('y2', t.y!.toFixed(1));
      }
    };
    paint();

    if (!fitted.current) {
      fitted.current = true;
      initialView.current = fitTo(null, false, 1.4);
    }

    let sim: Simulation<SimNode, undefined> | null = null;
    if (!reducedMotion) {
      sim = forceSimulation(nodes)
        .force('link', forceLink<SimNode, { source: string; target: string }>(g.links.map((l) => ({ source: l.source, target: l.target })))
          .id((d) => d.id).distance(36).strength(0.2))
        .force('charge', forceManyBody<SimNode>().strength(-45).distanceMax(260))
        .force('collide', forceCollide<SimNode>((d) => d.r + 5))
        // A gentle pull toward the offline layout keeps clusters where the pipeline put them.
        .force('x', forceX<SimNode>((d) => d.x0).strength(0.07))
        .force('y', forceY<SimNode>((d) => d.y0).strength(0.07))
        .alpha(prev.size ? 0.12 : 0.45)
        .alphaDecay(0.05)
        .on('tick', paint);
    }

    for (const { el, n } of nodeEls) {
      select(el).call(
        drag<SVGGElement, unknown>()
          .subject(() => ({ x: n.x!, y: n.y! }))
          .on('start', (e) => { if (!e.active) sim?.alphaTarget(0.15).restart(); n.fx = n.x; n.fy = n.y; })
          .on('drag', (e) => {
            n.fx = e.x; n.fy = e.y;
            if (!sim) { n.x = e.x; n.y = e.y; paint(); }
          })
          .on('end', (e) => { if (!e.active) sim?.alphaTarget(0); el.classList.add('is-pinned'); }),
      ).on('dblclick', () => { n.fx = n.fy = null; el.classList.remove('is-pinned'); sim?.alpha(0.2).restart(); });
    }
    return () => { sim?.stop(); };
  }, [g, radius, reducedMotion, fitTo]);

  // ---- kNN focus: selected drug + its 5 most similar drugs ----
  useEffect(() => {
    if (!similarFocus || !selectedId) { setSimilarIds([]); return; }
    let live = true;
    loadDetail(selectedId).then((d) => live && setSimilarIds(d.similar.map((s) => s.id))).catch(() => {});
    return () => { live = false; };
  }, [similarFocus, selectedId]);

  // ---- state classes, applied imperatively so hovering never re-renders 500 nodes ----
  useEffect(() => {
    const svg = svgRef.current;
    if (!g || !svg) return;
    const nodeEls = [...svg.querySelectorAll<SVGGElement>('g[data-id]')];
    const lineEls = [...svg.querySelectorAll<SVGLineElement>('line.link')];
    const hitLineEls = [...svg.querySelectorAll<SVGLineElement>('line.hit')];
    const apply = () => {
      const s = useStore.getState();
      const visible = visibleIds(g, s.filters);
      const focus = s.hoverId ?? s.selectedId;
      let lit: Set<string> | null = null;
      if (s.similarFocus && s.selectedId && similarIds.length && !s.hoverId) lit = new Set([s.selectedId, ...similarIds]);
      else if (focus && g.byId.has(focus)) lit = new Set([focus, ...(g.neighbors.get(focus) ?? [])]);

      for (const el of nodeEls) {
        const id = el.dataset.id!;
        el.classList.toggle('is-faded', !!visible && !visible.has(id));
        el.classList.toggle('is-dimmed', !!lit && !lit.has(id));
        el.classList.toggle('is-selected', id === s.selectedId);
        el.classList.toggle('is-lit', !!lit && lit.has(id));
      }
      for (const el of lineEls) {
        const a = el.dataset.s!, b = el.dataset.t!;
        el.classList.toggle('is-faded', !!visible && !(visible.has(a) && visible.has(b)));
        el.classList.toggle('is-dimmed', !!lit && !(focus && (a === focus || b === focus)) && !(lit.has(a) && lit.has(b) && s.similarFocus));
        el.classList.toggle('is-active', !!s.selectedId && (a === s.selectedId || b === s.selectedId));
      }
      for (const el of hitLineEls) el.classList.toggle('is-faded', !!visible && !(visible.has(el.dataset.s!) && visible.has(el.dataset.t!)));
      const sel = s.selectedId ? g.byId.get(s.selectedId) : undefined;
      linksRef.current?.setAttribute('class', `${styles.links} ${sel ? hueClass(sel, g, s.colorBy) : ''}`);
    };
    apply();
    return useStore.subscribe(apply);
  }, [g, similarIds]);

  // ---- center on request (search, bridges panel, kNN list) ----
  useEffect(() => {
    const svg = svgRef.current;
    const n = centerOn && simNodes.current.get(centerOn.id);
    if (!svg || !n || !zoomRef.current) return;
    const rect = svg.getBoundingClientRect();
    // Keep the node clear of the 400 px drawer, which overlays the right edge on desktop.
    const visibleRight = innerWidth >= 768 ? Math.min(rect.right, innerWidth - 432) : rect.right;
    const cx = Math.max(visibleRight - rect.left, rect.width / 3) / 2;
    const k = 1.6;
    const t = zoomIdentity.translate(cx - k * n.x!, rect.height / 2 - k * n.y!).scale(k);
    select(svg).transition().duration(reducedMotion ? 0 : 600).call(zoomRef.current.transform, t);
  }, [centerOn, reducedMotion]);

  const { select: selectNode, hover } = useStore.getState();
  const lens = useLens.getState();

  const linkEls = useMemo(() => g?.links.map((l) => (
    <line key={`${l.source}>${l.target}`} data-s={l.source} data-t={l.target}
      className={`link link--${l.type}${l.bridge ? ' link--bridge' : ''}`} />
  )), [g]);

  const hitEls = useMemo(() => g?.links.map((l) => (
    <line key={`${l.source}>${l.target}`} data-s={l.source} data-t={l.target} className={`hit ${styles.hit}`}
      onMouseEnter={() => lens.show({
        keys: [`edge.${l.type}`],
        params: { source: g.byId.get(l.source)!.label, target: g.byId.get(l.target)!.label },
        title: `${g.byId.get(l.source)!.label} → ${g.byId.get(l.target)!.label}`,
        subtitle: `${l.type}${l.trials ? ` · ${l.trials} trial${l.trials > 1 ? 's' : ''}` : ''}${l.bridge ? ' · joins two communities' : ''}`,
      })}
      onMouseLeave={lens.hide} />
  )), [g, lens]);

  const nodeEls = useMemo(() => g?.nodes.map((n) => {
    const r = radius(n);
    const icon = n.type === 'condition' ? 12 : Math.max(10, Math.min(12, r));
    const AreaIcon = AREA_ICON[n.area];
    const labelClass = n.type === 'drug' ? `label--drug${keyDrugs.has(n.id) ? ' label--key' : ''}` : `label--${n.type}`;
    return (
      <g key={n.id} data-id={n.id} className={`node node--${n.type} ${hueClass(n, g, colorBy)}`}
        onMouseEnter={() => { hover(n.id); lens.show(lensFor(n)); }}
        onMouseLeave={() => { hover(null); lens.hide(); }}
        onClick={(e) => { e.stopPropagation(); selectNode(n.id === useStore.getState().selectedId ? null : n.id); }}>
        <circle className="halo" r={n.type === 'condition' ? 20 : r + 8} />
        <g className="glyph">
          {n.type === 'target' && <><circle className="shape" r={r} /><Crosshair className="icon icon--on-fill" size={icon} x={-icon / 2} y={-icon / 2} strokeWidth={2.4} /></>}
          {n.type === 'drug' && <><circle className="shape" r={r} /><Pill className="icon" size={icon} x={-icon / 2} y={-icon / 2} strokeWidth={2.2} /></>}
          {n.type === 'condition' && <><rect className="shape" x={-13} y={-13} width={26} height={26} rx={7} /><AreaIcon className="icon" size={icon + 2} x={-(icon + 2) / 2} y={-(icon + 2) / 2} strokeWidth={2} /></>}
        </g>
        <text className={`label ${labelClass}`} y={(n.type === 'condition' ? 13 : r) + 14}>{n.label}</text>
      </g>
    );
  }), [g, radius, colorBy, keyDrugs, hover, lens, selectNode]);

  const summary = g
    ? `Network of ${g.nodes.length} drugs, targets and conditions with ${g.links.length} links, colored by ${g.communities.size} Louvain communities.`
    : 'Loading network';

  return (
    <>
      <svg ref={svgRef} role="img" aria-label={`${summary} Press + or − to zoom, 0 to fit.`} tabIndex={0}
        className={`${styles.svg}${showBridges ? '' : ' hide-bridges'}${isolateMode === 'hide' ? ' isolate-hide' : ''}`}
        onClick={() => selectNode(null)} onKeyDown={onKey}>
        <g ref={viewRef}>
          <g ref={linksRef} className={styles.links}>{linkEls}</g>
          <g>{hitEls}</g>
          <g>{nodeEls}</g>
        </g>
      </svg>
      <ZoomControls onZoom={onZoom} />
    </>
  );
}
