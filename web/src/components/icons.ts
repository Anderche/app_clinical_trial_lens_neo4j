// Lucide (MIT) icons, imported one by one so the bundle only carries what is used.
export {
  Brain, Building2, ChevronDown, Copy, Crosshair, FlaskConical, Github, Heart,
  Pill, Ribbon, Search, ShieldCheck, TriangleAlert, Weight, X,
} from 'lucide-react';
import { Brain, Heart, Ribbon, Weight, type LucideIcon } from 'lucide-react';
import type { Area } from '../lib/types';

export const AREA_ICON: Record<Area, LucideIcon> = { alz: Brain, obes: Weight, hf: Heart, onc: Ribbon };

export const AREA_LABEL: Record<Area, string> = {
  alz: 'Alzheimer’s', obes: 'Obesity / T2D', hf: 'Heart failure / CV', onc: 'Oncology',
};

export const AREAS: Area[] = ['alz', 'obes', 'hf', 'onc'];
