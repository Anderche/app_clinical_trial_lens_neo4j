import type { CypherTemplates, Detail, Graph, Lane, Meta, SearchItem } from './types';

const DATA = `${import.meta.env.BASE_URL}data`;

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

export interface CoreData {
  graph: Graph;
  meta: Meta;
  cypher: CypherTemplates;
  timeline: Lane[];
}

export async function loadCore(): Promise<CoreData> {
  const [graph, meta, cypher, timeline] = await Promise.all([
    getJSON<Graph>(`${DATA}/graph.json`),
    getJSON<Meta>(`${DATA}/meta.json`),
    getJSON<CypherTemplates>(`${DATA}/cypher.json`),
    getJSON<Lane[]>(`${DATA}/timeline.json`),
  ]);
  return { graph, meta, cypher, timeline };
}

let searchIndex: Promise<SearchItem[]> | null = null;
export const loadSearchIndex = () => (searchIndex ??= getJSON<SearchItem[]>(`${DATA}/search-index.json`));

const details = new Map<string, Promise<Detail>>();

/** Drawer data. Goes through /api so a live Neo4j backend can replace the file read later;
 *  falls back to the static file so `vite dev` or any static host works on its own. */
export function loadDetail(id: string): Promise<Detail> {
  let p = details.get(id);
  if (!p) {
    p = getJSON<Detail>(`/api/details/${encodeURIComponent(id)}`)
      .catch(() => getJSON<Detail>(`${DATA}/details/${id.replace(':', '_')}.json`));
    p.catch(() => details.delete(id));
    details.set(id, p);
  }
  return p;
}
