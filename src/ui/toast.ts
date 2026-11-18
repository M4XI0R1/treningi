import { h } from '../util';

/**
 * Powiadomienia. Jedno naraz: nowe zastępuje poprzednie.
 * Ruch: wejście od dołu 400 ms `ease` (jak Sonner), wyjście szybsze (200 ms).
 * Przerywalne, bo to transitions, nie keyframes.
 */
interface ToastOptions {
  action?: { label: string; onClick: () => void };
  duration?: number;
  /** Nie znika samo (np. komunikat o nowej wersji). */
  persistent?: boolean;
  tone?: 'default' | 'success' | 'error';
}

let current: { el: HTMLElement; timer?: ReturnType<typeof setTimeout> } | null = null;

export function toast(message: string, opts: ToastOptions = {}) {
  const host = document.getElementById('toasts')!;
  dismiss();

  const el = h(
    'div',
    { class: `toast toast-${opts.tone ?? 'default'}`, role: 'status', dataset: { state: 'closed' } },
    h('span', { class: 'toast-text' }, message),
    opts.action &&
      h(
        'button',
        {
          class: 'toast-action',
          onclick: () => {
            opts.action!.onClick();
            dismiss();
          },
        },
        opts.action.label,
      ),
  );
  host.append(el);
  void el.offsetHeight;
  el.dataset.state = 'open';

  const entry: { el: HTMLElement; timer?: ReturnType<typeof setTimeout> } = { el };
  if (!opts.persistent) {
    const ms = opts.duration ?? 3200;
    let remaining = ms;
    let started = Date.now();
    const arm = () => {
      started = Date.now();
      entry.timer = setTimeout(() => current === entry && dismiss(), remaining);
    };
    // Pauza, gdy aplikacja jest w tle: powiadomienie nie ginie niezauważone.
    const onVis = () => {
      if (!el.isConnected) return document.removeEventListener('visibilitychange', onVis);
      if (document.hidden) {
        clearTimeout(entry.timer);
        remaining -= Date.now() - started;
      } else arm();
    };
    document.addEventListener('visibilitychange', onVis);
    arm();
  }
  current = entry;
}

export function dismiss() {
  if (!current) return;
  const { el, timer } = current;
  clearTimeout(timer);
  current = null;
  el.dataset.state = 'closing';
  const remove = () => el.remove();
  el.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, 300);
}
