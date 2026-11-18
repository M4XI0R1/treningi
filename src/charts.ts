import { h, svg } from './util';

export interface ChartPoint {
  x: number; // znacznik czasu
  y: number;
}

interface LineOptions {
  format: (y: number) => string;
  formatX: (x: number) => string;
  height?: number;
  label: string;
}

/**
 * Wykres liniowy w SVG. Bez animacji (dane funkcjonalne, mają się nie ruszać).
 * Dotknięcie/przeciągnięcie pokazuje najbliższy punkt z wartością i datą.
 * Rysowany po zmierzeniu szerokości (ResizeObserver), więc kreski i kropki nie są zniekształcone.
 */
export function lineChart(points: ChartPoint[], opts: LineOptions): HTMLElement {
  const height = opts.height ?? 180;
  const wrap = h('div', { class: 'chart', style: `height:${height}px`, role: 'img', 'aria-label': opts.label });
  const tip = h('div', { class: 'chart-tip', hidden: true });
  wrap.append(tip);
  if (!points.length) return wrap;

  let selected: number | null = null;
  let lastWidth = 0;

  const draw = (width: number) => {
    lastWidth = width;
    wrap.querySelector('svg')?.remove();
    const padL = 44;
    const padR = 12;
    const padT = 14;
    const padB = 24;
    const plotW = Math.max(10, width - padL - padR);
    const plotH = height - padT - padB;

    const ys = points.map((p) => p.y);
    let min = Math.min(...ys);
    let max = Math.max(...ys);
    if (min === max) {
      const pad = Math.max(1, Math.abs(min) * 0.05);
      min -= pad;
      max += pad;
    } else {
      const pad = (max - min) * 0.12;
      min = Math.max(0, min - pad);
      max += pad;
    }
    const x0 = points[0].x;
    const x1 = points[points.length - 1].x;
    const sx = (x: number) => padL + (x1 === x0 ? plotW / 2 : ((x - x0) / (x1 - x0)) * plotW);
    const sy = (y: number) => padT + (1 - (y - min) / (max - min)) * plotH;

    const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });
    for (const t of [0, 0.5, 1]) {
      const v = min + (max - min) * t;
      const y = sy(v);
      root.append(
        svg('line', { x1: padL, x2: width - padR, y1: y, y2: y, class: 'chart-grid' }),
        Object.assign(svg('text', { x: padL - 8, y: y + 4, class: 'chart-axis', 'text-anchor': 'end' }), {
          textContent: opts.format(v),
        }),
      );
    }
    root.append(
      Object.assign(svg('text', { x: padL, y: height - 6, class: 'chart-axis', 'text-anchor': 'start' }), {
        textContent: opts.formatX(x0),
      }),
    );
    if (x1 !== x0) {
      root.append(
        Object.assign(svg('text', { x: width - padR, y: height - 6, class: 'chart-axis', 'text-anchor': 'end' }), {
          textContent: opts.formatX(x1),
        }),
      );
    }

    const coords = points.map((p) => [sx(p.x), sy(p.y)] as const);
    if (coords.length > 1) {
      const d = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
      const area = `${d}L${coords[coords.length - 1][0].toFixed(1)} ${padT + plotH}L${coords[0][0].toFixed(1)} ${padT + plotH}Z`;
      root.append(svg('path', { d: area, class: 'chart-area' }), svg('path', { d, class: 'chart-line' }));
    }
    const dots = coords.length <= 60;
    if (dots) for (const [x, y] of coords) root.append(svg('circle', { cx: x, cy: y, r: 3, class: 'chart-dot' }));

    const cursor = svg('line', { y1: padT, y2: padT + plotH, class: 'chart-cursor', visibility: 'hidden' });
    const focus = svg('circle', { r: 5.5, class: 'chart-focus', visibility: 'hidden' });
    root.append(cursor, focus);
    wrap.prepend(root);

    const show = (i: number) => {
      selected = i;
      const [x, y] = coords[i];
      for (const el of [cursor, focus]) el.setAttribute('visibility', 'visible');
      cursor.setAttribute('x1', String(x));
      cursor.setAttribute('x2', String(x));
      focus.setAttribute('cx', String(x));
      focus.setAttribute('cy', String(y));
      tip.hidden = false;
      tip.replaceChildren(
        h('strong', { class: 'num' }, opts.format(points[i].y)),
        h('span', null, opts.formatX(points[i].x)),
      );
      const tw = tip.offsetWidth;
      tip.style.transform = `translateX(${Math.round(Math.min(Math.max(x - tw / 2, 0), width - tw))}px)`;
    };
    const pick = (clientX: number) => {
      const rect = root.getBoundingClientRect();
      const px = clientX - rect.left;
      let best = 0;
      for (let i = 1; i < coords.length; i++) {
        if (Math.abs(coords[i][0] - px) < Math.abs(coords[best][0] - px)) best = i;
      }
      show(best);
    };
    root.addEventListener('pointerdown', (e) => pick(e.clientX));
    root.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pointerType === 'touch') pick(e.clientX);
    });
    if (selected !== null && selected < coords.length) show(selected);
  };

  const ro = new ResizeObserver((entries) => {
    const w = Math.round(entries[0].contentRect.width);
    if (w > 0 && w !== lastWidth) draw(w);
  });
  ro.observe(wrap);
  return wrap;
}

/** Słupki tygodniowe (HTML, bez animacji). */
export function columnChart(items: { label: string; value: number; current?: boolean }[], aria: string) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return h(
    'div',
    { class: 'cols', role: 'img', 'aria-label': aria },
    items.map((i) =>
      h(
        'div',
        { class: `col${i.current ? ' is-current' : ''}` },
        h('span', { class: 'col-value num' }, String(i.value)),
        h('div', { class: 'col-track' }, h('div', { class: 'col-bar', style: `height:${(i.value / max) * 100}%` })),
        h('span', { class: 'col-label num' }, i.label),
      ),
    ),
  );
}
