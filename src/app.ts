export type Tab = 'trening' | 'historia' | 'progres' | 'plan';

/** Nawigacja ustawiana przez main.ts; widoki wołają ją bez cyklicznych importów. */
export const app = {
  tab: 'trening' as Tab,
  go: (_tab: Tab, _opts?: { top?: boolean }) => {},
  rerender: () => {},
};
