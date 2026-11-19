import { state } from '../store';
import type { Plan } from '../types';
import { h, icon } from '../util';

/**
 * Kategoria planu = kolor i ikona (Push ↑, Pull ↓, Upper hantle, Lower piorun).
 * Najpierw po nazwie, potem po pozycji w rotacji, więc własne plany też dostają spójny kolor.
 */
export type Category = 'push' | 'pull' | 'upper' | 'lower' | 'none';

const ICON: Record<Category, string> = {
  push: 'arrowUp',
  pull: 'arrowDown',
  upper: 'dumbbell',
  lower: 'bolt',
  none: 'star',
};

const ORDER: Category[] = ['push', 'pull', 'upper', 'lower'];

export function categoryOf(planId: string | null | undefined, name = ''): Category {
  const n = name.toLocaleLowerCase('pl-PL');
  if (/push|pchan/.test(n)) return 'push';
  if (/pull|ciąg/.test(n)) return 'pull';
  if (/upper|gór/.test(n)) return 'upper';
  if (/lower|dół|dol|nogi|leg/.test(n)) return 'lower';
  const idx = planId ? state.plans.findIndex((p) => p.id === planId) : -1;
  return idx >= 0 ? ORDER[idx % ORDER.length] : 'none';
}

export function planCategory(plan: Plan): Category {
  return categoryOf(plan.id, plan.name);
}

export function catBadge(cat: Category, size: 'sm' | 'md' | 'lg' = 'md') {
  return h('span', { class: `cat-badge cat-${cat} cat-badge-${size}`, 'aria-hidden': 'true' }, icon(ICON[cat], size === 'sm' ? 18 : 20));
}
