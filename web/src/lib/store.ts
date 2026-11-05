import { create } from 'zustand';
import type { CoreData } from './data';
import type { Area, Detail, GLink, GNode, Phase } from './types';

export interface Filters {
  areas: Area[];
  phases: Phase[];
  years: [number, number];
  communities: number[];
  sponsor: string;
}

export const DEFAULT_YEARS: [number, number] = [2023, 2026];
export const emptyFilters = (): Filters => ({ areas: [], phases: [], years: [...DEFAULT_YEARS], communities: [], sponsor: '' });

interface State {
  data: CoreData | null;
  /** Drugs outside the 500-node cap, pulled in from search on demand. */
  extraNodes: GNode[];
  extraLinks: GLink[];

  selectedId: string | null;
  hoverId: string | null;
  filters: Filters;
  sizeBy: 'pagerank' | 'uniform';
  colorBy: 'community' | 'area';
  showBridges: boolean;
  similarFocus: boolean;
  /** How nodes outside the active filters are drawn: faded for context, or hidden. */
  isolateMode: 'fade' | 'hide';
  /** Bumped to ask the canvas to fit the visible nodes. */
  fitRequest: number;
  /** Bumped to ask the canvas to pan to a node. */
  centerOn: { id: string; n: number } | null;

  setData: (d: CoreData) => void;
  select: (id: string | null, center?: boolean) => void;
  hover: (id: string | null) => void;
  setFilters: (f: Partial<Filters>) => void;
  resetFilters: () => void;
  set: (p: Partial<Pick<State, 'sizeBy' | 'colorBy' | 'showBridges' | 'similarFocus' | 'isolateMode'>>) => void;
  /** One tap: show only this community, or everything again if it is already the only one. */
  isolate: (community: number) => void;
  requestFit: () => void;
  addExtra: (d: Detail) => void;
}

export const useStore = create<State>()((set, get) => ({
  data: null,
  extraNodes: [],
  extraLinks: [],
  selectedId: null,
  hoverId: null,
  filters: emptyFilters(),
  sizeBy: 'pagerank',
  colorBy: 'community',
  showBridges: true,
  similarFocus: false,
  isolateMode: 'fade',
  fitRequest: 0,
  centerOn: null,

  setData: (data) => set({ data }),
  select: (id, center = false) =>
    set((s) => ({
      selectedId: id,
      similarFocus: id ? s.similarFocus : false,
      centerOn: center && id ? { id, n: (s.centerOn?.n ?? 0) + 1 } : s.centerOn,
    })),
  hover: (hoverId) => set({ hoverId }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  resetFilters: () => set({ filters: emptyFilters() }),
  set: (p) => set(p),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
  isolate: (community) =>
    set((s) => {
      const only = s.filters.communities.length === 1 && s.filters.communities[0] === community;
      return { filters: { ...s.filters, communities: only ? [] : [community] }, fitRequest: s.fitRequest + 1 };
    }),
  addExtra: (d) => {
    const { data, extraNodes } = get();
    if (!data || extraNodes.some((n) => n.id === d.id) || data.graph.nodes.some((n) => n.id === d.id)) return;
    const present = new Set(data.graph.nodes.map((n) => n.id));
    const nbs = d.neighbors.filter((nb) => present.has(nb.id));
    const pos = data.graph.nodes.filter((n) => nbs.some((nb) => nb.id === n.id));
    const node: GNode = {
      id: d.id, type: d.type, label: d.label, area: d.area, areas: d.areas, community: d.community,
      pagerank: d.pagerank, maxPhase: d.fda?.status === 'approved' ? 'approved' : undefined,
      x: pos.length ? pos.reduce((a, n) => a + n.x, 0) / pos.length + 20 : (d.x ?? 0),
      y: pos.length ? pos.reduce((a, n) => a + n.y, 0) / pos.length + 20 : (d.y ?? 0),
      sponsors: [...new Set(d.trials.map((t) => t.sponsor))].slice(0, 5),
      years: [...new Set(d.trials.map((t) => t.start))].sort(),
      bridge: d.areas.length >= 2,
    };
    const byId = new Map(data.graph.nodes.map((n) => [n.id, n]));
    const links: GLink[] = nbs.map((nb) => ({
      source: d.id, target: nb.id, type: nb.rel, bridge: byId.get(nb.id)!.community !== d.community,
    }));
    set((s) => ({ extraNodes: [...s.extraNodes, node], extraLinks: [...s.extraLinks, ...links] }));
  },
}));

// ---- URL mirroring: every selection + filter state is a shareable link. ----

const AREAS: Area[] = ['alz', 'obes', 'hf', 'onc'];
const PHASES: Phase[] = ['phase1', 'phase2', 'phase3', 'phase4', 'approved'];

export function readUrl(): Partial<State> {
  const q = new URLSearchParams(location.search);
  const list = <T extends string>(k: string, allowed: T[]) => (q.get(k)?.split(',') ?? []).filter((v): v is T => allowed.includes(v as T));
  const years = q.get('years')?.split('-').map(Number);
  const f = emptyFilters();
  f.areas = list('areas', AREAS);
  f.phases = list('phases', PHASES);
  if (years?.length === 2 && years.every((y) => y >= DEFAULT_YEARS[0] && y <= DEFAULT_YEARS[1])) f.years = [years[0], years[1]];
  f.communities = (q.get('communities') ?? q.get('community') ?? '').split(',').filter(Boolean).map(Number).filter(Number.isInteger);
  f.sponsor = q.get('sponsor') ?? '';
  return {
    filters: f,
    selectedId: q.get('node'),
    sizeBy: q.get('size') === 'uniform' ? 'uniform' : 'pagerank',
    colorBy: q.get('color') === 'area' ? 'area' : 'community',
    showBridges: q.get('bridges') !== 'off',
    isolateMode: q.get('isolate') === 'hide' ? 'hide' : 'fade',
  };
}

export function syncUrl() {
  return useStore.subscribe((s) => {
    const q = new URLSearchParams();
    const { filters: f } = s;
    if (s.selectedId) q.set('node', s.selectedId);
    if (f.areas.length) q.set('areas', f.areas.join(','));
    if (f.phases.length) q.set('phases', f.phases.join(','));
    if (f.years[0] !== DEFAULT_YEARS[0] || f.years[1] !== DEFAULT_YEARS[1]) q.set('years', f.years.join('-'));
    if (f.communities.length) q.set('communities', f.communities.join(','));
    if (f.sponsor) q.set('sponsor', f.sponsor);
    if (s.sizeBy === 'uniform') q.set('size', 'uniform');
    if (s.colorBy === 'area') q.set('color', 'area');
    if (!s.showBridges) q.set('bridges', 'off');
    if (s.isolateMode === 'hide') q.set('isolate', 'hide');
    const next = q.toString() ? `?${q}` : location.pathname;
    if (next !== location.search && !(next === location.pathname && !location.search)) {
      history.replaceState(null, '', `${next}${location.hash}`);
    }
  });
}
