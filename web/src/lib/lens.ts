import { create } from 'zustand';

/** What the Cypher lens is showing: template keys from cypher.json plus the values to fill in. */
export interface LensTarget {
  keys: string[];
  params: Record<string, string>;
  title: string;
  subtitle?: string;
}

interface LensState {
  target: LensTarget | null;
  pinned: boolean;
  show: (t: LensTarget) => void;
  hide: () => void;
  setPinned: (p: boolean) => void;
}

export const useLens = create<LensState>()((set, get) => ({
  target: null,
  pinned: false,
  show: (target) => { if (!get().pinned) set({ target }); },
  hide: () => { if (!get().pinned) set({ target: null }); },
  setPinned: (pinned) => set(pinned ? { pinned } : { pinned, target: null }),
}));

const quote = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Substitute $params with the hovered element's real values, as Cypher string literals. */
export function fillTemplate(tpl: string, params: Record<string, string>): string {
  return tpl.replace(/\$([a-zA-Z]+)/g, (m, k: string) => (k in params ? quote(params[k]) : m));
}
