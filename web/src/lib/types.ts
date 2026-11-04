// Mirrors the JSON contract written by pipeline/export.py (see pipeline/schema.json).

export type Area = 'alz' | 'obes' | 'hf' | 'onc';
export type NodeType = 'drug' | 'target' | 'condition';
export type Phase = 'phase1' | 'phase2' | 'phase3' | 'phase4' | 'approved';

export interface GNode {
  id: string;
  type: NodeType;
  label: string;
  name?: string;
  area: Area;
  areas: Area[];
  community: number;
  pagerank: number;
  x: number;
  y: number;
  maxPhase?: Phase;
  sponsors?: string[];
  firstStart?: number;
  years?: number[];
  trialCount?: number;
  bridge?: boolean;
}

export interface GLink {
  source: string;
  target: string;
  type: 'TARGETS' | 'TESTED_IN';
  trials?: number;
  bridge: boolean;
}

export interface Community {
  id: number;
  label: string;
  size: number;
  area: Area;
  tint: number;
  topTargets: string[];
}

export interface Graph {
  nodes: GNode[];
  links: GLink[];
  communities: Community[];
}

export interface Trial {
  nct: string;
  title: string;
  phase: string;
  start: number;
  sponsor: string;
  conditions: string[];
  drugs: string[];
}

export interface Detail {
  id: string;
  type: NodeType;
  label: string;
  name: string | null;
  area: Area;
  areas: Area[];
  community: number;
  pagerank: number;
  inGraph: boolean;
  moa: string | null;
  fda: { status: 'approved' | 'investigational'; brand: string | null; approved: string | null; actions: { date: string; label: string }[] } | null;
  faers: { term: string; count: number | null }[];
  trialCount: number;
  trials: Trial[];
  similar: { id: string; label: string; score: number }[];
  neighbors: { id: string; label: string; type: NodeType; rel: GLink['type'] }[];
  x?: number;
  y?: number;
}

export interface Meta {
  buildDate: string;
  source: 'sample' | 'live';
  engine: string;
  versions: Record<string, string>;
  years: [number, number];
  areas: Record<Area, string>;
  counts: Record<string, number>;
}

export interface Lane {
  id: string;
  label: string;
  area: Area;
  start: number;
  end: number;
  trialCount: number;
  brand: string | null;
  actions: { date: string; label: string }[];
}

export interface SearchItem {
  id: string;
  label: string;
  type: NodeType;
  area: Area;
  alt: string;
  inGraph: boolean;
}

export type CypherTemplates = Record<string, string>;
