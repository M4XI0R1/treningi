import { state } from '../store';

/** Wariant kolorów jako atrybut na <html>; zmienne CSS robią resztę. */
export function applyTheme() {
  const theme = state.settings.theme ?? 'categories';
  if (theme === 'categories') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f5f5f7';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}
