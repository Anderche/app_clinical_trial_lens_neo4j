import { useMemo } from 'react';
import { DEFAULT_YEARS, useStore, type Filters } from './store';
import type { Community, GLink, GNode } from './types';

export interface ViewGraph {
  nodes: GNode[];
  links: GLink[];
  byId: Map<string, GNode>;
  neighbors: Map<string, Set<string>>;
  communities: Map<number, Community>;
}

/** graph.json plus any drugs pulled in on demand from search. */
export function useViewGraph(): ViewGraph | null {
  const data = useStore((s) => s.data);
  const extraNodes = useStore((s) => s.extraNodes);
  const extraLinks = useStore((s) => s.extraLinks);
  return useMemo(() => {
    if (!data) return null;
    const nodes = [...data.graph.nodes, ...extraNodes];
    const links = [...data.graph.links, ...extraLinks];
    const neighbors = new Map(nodes.map((n) => [n.id, new Set<string>()]));
    for (const l of links) {
      neighbors.get(l.source)?.add(l.target);
      neighbors.get(l.target)?.add(l.source);
    }
    return {
      nodes, links, neighbors,
      byId: new Map(nodes.map((n) => [n.id, n])),
      communities: new Map(data.graph.communities.map((c) => [c.id, c])),
    };
  }, [data, extraNodes, extraLinks]);
}

const drugFiltersActive = (f: Filters) =>
  f.phases.length > 0 || f.sponsor.trim() !== '' || f.years[0] !== DEFAULT_YEARS[0] || f.years[1] !== DEFAULT_YEARS[1];

/** Ids that pass the filters, or null when nothing is filtered. Filtered-out nodes fade, never vanish. */
export function visibleIds(g: ViewGraph, f: Filters): Set<string> | null {
  const drugLevel = drugFiltersActive(f);
  if (!drugLevel && !f.areas.length && !f.communities.length) return null;
  const sponsor = f.sponsor.trim().toLowerCase();
  const base = (n: GNode) =>
    (!f.communities.length || f.communities.includes(n.community)) &&
    (!f.areas.length || n.areas.some((a) => f.areas.includes(a)));
  const drugOk = (n: GNode) =>
    base(n) &&
    (!f.phases.length || (n.maxPhase !== undefined && f.phases.includes(n.maxPhase))) &&
    (!n.years || n.years.some((y) => y >= f.years[0] && y <= f.years[1])) &&
    (!sponsor || (n.sponsors ?? []).some((s) => s.toLowerCase().includes(sponsor)));

  const out = new Set<string>();
  for (const n of g.nodes) if (n.type === 'drug' && drugOk(n)) out.add(n.id);
  for (const n of g.nodes) {
    if (n.type === 'drug' || !base(n)) continue;
    // Targets and conditions stay lit when at least one of their drugs passes.
    if (!drugLevel || [...(g.neighbors.get(n.id) ?? [])].some((id) => out.has(id))) out.add(n.id);
  }
  return out;
}

/** CSS classes that give an element its hue: community colour (with tint) or plain area colour. */
export function hueClass(n: Pick<GNode, 'area' | 'community'>, g: ViewGraph | null, colorBy: 'community' | 'area'): string {
  const c = colorBy === 'community' ? g?.communities.get(n.community) : undefined;
  return c ? `area-${c.area} tint-${Math.min(c.tint, 3)}` : `area-${n.area}`;
}
