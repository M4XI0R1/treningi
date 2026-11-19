import { h, icon } from '../util';

/**
 * Arkusz wysuwany od dołu.
 * Ruch: transform + opacity, krzywa ease-drawer (iOS). Wejście 500 ms, wyjście 320 ms.
 * Gest: chwyt (uchwyt + nagłówek) śledzi palec 1:1, zamyka po odległości lub szybkim ruchu.
 */
export interface SheetHandle {
  el: HTMLElement;
  body: HTMLElement;
  close: () => Promise<void>;
}

interface SheetOptions {
  title?: string;
  /** Mały nadtytuł nad tytułem (np. „PODSUMOWANIE SESJI”). */
  eyebrow?: string;
  /** Podtytuł pod tytułem. */
  subtitle?: string;
  /** Element po lewej stronie tytułu (np. ikona kategorii). */
  leading?: HTMLElement;
  /** Element obok tytułu (np. pigułka „Następny”). */
  titleAside?: HTMLElement | null;
  /** Przycisk ✕ w nagłówku (domyślnie, gdy jest tytuł). */
  closeButton?: boolean;
  /** Arkusz akcji iOS: pływająca grupa przycisków zamiast pełnego arkusza. */
  action?: boolean;
  /** Własny nagłówek zamiast tytułu (np. Anuluj / Zapisz). */
  header?: HTMLElement;
  content: HTMLElement | (HTMLElement | null | false | undefined)[];
  onClose?: () => void;
  /** Nie zamykaj przez tapnięcie tła ani gest (np. edycja z niezapisanymi zmianami). */
  guarded?: () => boolean;
  className?: string;
}

const stack: SheetHandle[] = [];

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close();
});

export function openSheet(opts: SheetOptions): SheetHandle {
  const host = document.getElementById('sheets')!;
  const previousFocus = document.activeElement as HTMLElement | null;

  const overlay = h('div', { class: 'sheet-overlay' });
  const grab = h('div', { class: 'sheet-grab', 'aria-hidden': 'true' }, h('div', { class: 'sheet-handle' }));
  let close: () => Promise<void> = () => Promise.resolve();
  const header =
    opts.header ??
    (opts.title && !opts.action
      ? h(
          'div',
          { class: 'sheet-header' },
          h(
            'div',
            { class: 'sheet-header-main' },
            opts.leading,
            h(
              'div',
              { style: 'min-width:0' },
              opts.eyebrow && h('p', { class: 'sheet-eyebrow' }, opts.eyebrow),
              h(
                'div',
                { class: 'hist-name-row' },
                h('h2', { class: 'sheet-title' }, opts.title),
                opts.titleAside,
              ),
              opts.subtitle && h('p', { class: 'sheet-sub' }, opts.subtitle),
            ),
          ),
          opts.closeButton !== false &&
            h('button', { class: 'round-btn round-btn-sm', 'aria-label': 'Zamknij', onclick: () => close() }, icon('close', 16)),
        )
      : null);
  const body = h('div', { class: 'sheet-body' }, Array.isArray(opts.content) ? opts.content.filter(Boolean) : opts.content);
  const sheet = h(
    'div',
    {
      class: `sheet ${opts.className ?? ''}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': opts.title ?? 'Okno',
      tabindex: '-1',
    },
    opts.action ? null : h('div', { class: 'sheet-drag' }, grab, header),
    body,
  );
  const root = h('div', { class: `sheet-root${opts.action ? ' action-root' : ''}`, dataset: { state: 'closed' } }, overlay, sheet);
  host.append(root);

  let closed = false;
  const handle: SheetHandle = {
    el: sheet,
    body,
    close: () => {
      if (closed) return Promise.resolve();
      closed = true;
      const i = stack.indexOf(handle);
      if (i >= 0) stack.splice(i, 1);
      sheet.style.transform = '';
      sheet.style.transition = '';
      overlay.style.opacity = '';
      overlay.style.transition = '';
      root.dataset.state = 'closing';
      opts.onClose?.();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      return new Promise((resolve) => {
        const finish = () => {
          root.remove();
          resolve();
        };
        sheet.addEventListener('transitionend', (e) => e.target === sheet && finish(), { once: false });
        setTimeout(finish, 450); // zapas, gdy transition się nie odpali (reduced motion)
      });
    },
  };
  stack.push(handle);
  close = handle.close;

  // Wymuś styl początkowy, potem stan otwarty: transition z translateY(100%) do 0.
  void sheet.offsetHeight;
  root.dataset.state = 'open';
  sheet.focus({ preventScroll: true });

  overlay.addEventListener('click', () => {
    if (!opts.guarded?.()) handle.close();
  });

  const dragZone = sheet.querySelector<HTMLElement>('.sheet-drag');
  if (dragZone) attachDrag(dragZone, sheet, overlay, handle, opts.guarded);
  return handle;
}

function attachDrag(
  zone: HTMLElement,
  sheet: HTMLElement,
  overlay: HTMLElement,
  handle: SheetHandle,
  guarded?: () => boolean,
) {
  let pointerId: number | null = null;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let height = 1;
  let dragging = false;

  zone.addEventListener('pointerdown', (e) => {
    if (pointerId !== null) return; // ignoruj drugi palec
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    pointerId = e.pointerId;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    velocity = 0;
    height = sheet.getBoundingClientRect().height || 1;
    dragging = false;
  });

  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    const dy = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(dy) < 6) return; // próg, żeby tapnięcie nie było przeciągnięciem
      dragging = true;
      zone.setPointerCapture(e.pointerId);
      sheet.style.transition = 'none';
      overlay.style.transition = 'none';
    }
    const dt = Math.max(1, e.timeStamp - lastT);
    velocity = (e.clientY - lastY) / dt;
    lastY = e.clientY;
    lastT = e.timeStamp;
    // W dół 1:1, w górę z oporem (gumka), zamiast twardej ściany.
    const offset = dy >= 0 ? dy : -Math.sqrt(-dy) * 2.5;
    sheet.style.transform = `translateY(${offset}px)`;
    overlay.style.opacity = String(Math.max(0, 1 - Math.max(0, offset) / height));
  });

  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (!dragging) return;
    dragging = false;
    const dy = e.clientY - startY;
    const shouldClose = !guarded?.() && (dy > height * 0.35 || (velocity > 0.5 && dy > 20));
    if (shouldClose) {
      handle.close();
      return;
    }
    // Szybki powrót z bieżącej pozycji.
    sheet.style.transition = 'transform 280ms var(--ease-out)';
    overlay.style.transition = 'opacity 280ms var(--ease-out)';
    sheet.style.transform = '';
    overlay.style.opacity = '';
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
}

// ---------- Potwierdzenie (zamiast confirm()) ----------

interface ConfirmOptions {
  title: string;
  eyebrow?: string;
  message?: string | HTMLElement;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function confirmSheet(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    let sheet: SheetHandle;
    const confirm = () => {
      result = true;
      void sheet.close();
    };
    // Destrukcyjne potwierdzenia: arkusz akcji iOS (grupa + osobne „Anuluj” pod spodem).
    if (opts.danger && (typeof opts.message === 'string' || !opts.message)) {
      sheet = openSheet({
        title: opts.title,
        action: true,
        content: [
          h(
            'div',
            { class: 'action-group', role: 'alertdialog', 'aria-label': opts.title },
            h(
              'div',
              { class: 'action-head' },
              h('p', { class: 'action-title' }, opts.title),
              opts.message ? h('p', { class: 'action-text' }, opts.message as string) : null,
            ),
            h('button', { class: 'action-btn is-danger', onclick: confirm }, opts.confirmLabel),
          ),
          h('button', { class: 'action-btn action-cancel', onclick: () => sheet.close() }, opts.cancelLabel ?? 'Anuluj'),
        ],
        onClose: () => resolve(result),
      });
      return;
    }
    sheet = openSheet({
      title: opts.title,
      eyebrow: opts.eyebrow,
      content: [
        opts.message
          ? typeof opts.message === 'string'
            ? h('p', { class: 'sheet-text' }, opts.message)
            : opts.message
          : null,
        h(
          'div',
          { class: 'sheet-actions' },
          h('button', { class: `btn btn-block ${opts.danger ? 'btn-danger' : 'btn-primary'}`, onclick: confirm }, opts.confirmLabel),
          h('button', { class: 'btn btn-block btn-gray', onclick: () => sheet.close() }, opts.cancelLabel ?? 'Anuluj'),
        ),
      ],
      onClose: () => resolve(result),
    });
  });
}
