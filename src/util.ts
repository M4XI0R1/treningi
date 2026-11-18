type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & {
  class?: string;
  dataset?: Record<string, string>;
  style?: string;
};

/** Minimalny helper do budowania DOM. Tekst zawsze trafia jako textContent (bez innerHTML). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = String(value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'style') el.setAttribute('style', String(value));
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === 'value' || (key in el && typeof value !== 'string')) {
        (el as unknown as Record<string, unknown>)[key] = value;
      } else el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

function append(el: Element, children: (Child | Child[])[]) {
  for (const child of children) {
    if (Array.isArray(child)) append(el, child);
    else if (child === null || child === undefined || child === false) continue;
    else el.append(child instanceof Node ? child : String(child));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: (SVGElement | null | false)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Ikony liniowe 24×24, rysowane ścieżkami. */
const ICONS: Record<string, string> = {
  dumbbell: 'M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2',
  chart: 'M4 19h16M6 15l4-5 4 3 5-7',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3',
  chevron: 'M9 6l6 6-6 6',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 20h7',
  timer: 'M12 8v5l3 2M9 2h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  note: 'M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4',
};

export function icon(name: keyof typeof ICONS | string, size = 22): SVGSVGElement {
  const el = svg(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': name === 'more' ? 3.4 : 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      class: 'icon',
    },
    svg('path', { d: ICONS[name] ?? '' }),
  );
  return el;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------- Polskie liczebniki ----------

const pluralRules = new Intl.PluralRules('pl-PL');
/** plural(5, ['trening', 'treningi', 'treningów']) → „5 treningów”. */
export function plural(n: number, forms: [one: string, few: string, many: string], withNumber = true): string {
  let form: string;
  if (!Number.isInteger(n)) form = forms[1]; // 2,5 kilograma → „treningi”-forma (other)
  else {
    const rule = pluralRules.select(n);
    form = rule === 'one' ? forms[0] : rule === 'few' ? forms[1] : forms[2];
  }
  return withNumber ? `${fmtNum(n)} ${form}` : form;
}

export const W = {
  workout: ['trening', 'treningi', 'treningów'] as [string, string, string],
  set: ['seria', 'serie', 'serii'] as [string, string, string],
  exercise: ['ćwiczenie', 'ćwiczenia', 'ćwiczeń'] as [string, string, string],
  record: ['rekord', 'rekordy', 'rekordów'] as [string, string, string],
  day: ['dzień', 'dni', 'dni'] as [string, string, string],
  entry: ['pomiar', 'pomiary', 'pomiarów'] as [string, string, string],
};

// ---------- Liczby ----------

const numFormats = new Map<number, Intl.NumberFormat>();
export function fmtNum(n: number, maxFrac = 2): string {
  let f = numFormats.get(maxFrac);
  if (!f) {
    f = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: maxFrac, useGrouping: true });
    numFormats.set(maxFrac, f);
  }
  // pl-PL domyślnie nie grupuje liczb 4-cyfrowych; tu wolimy spójnie „1 284”.
  return f.format(n).replace(/^(-?\d)(\d{3})(?=,|$)/, '$1 $2');
}

export function fmtKg(n: number): string {
  return `${fmtNum(n)} kg`;
}

/** Ciężar serii: 0 kg to ćwiczenie z masą ciała („MC”). */
export function fmtLoad(weight: number | null, short = false): string {
  if (!weight) return 'MC';
  return short ? fmtNum(weight) : fmtKg(weight);
}

/** Parsuje „82,5” i „82.5”. Zwraca null dla pustego lub błędnego wpisu. */
export function parseNum(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function round(n: number, step = 0.01): number {
  return Math.round(n / step) * step;
}

// ---------- Czas ----------

const DAY = 86_400_000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Poniedziałek 00:00 tygodnia, w którym jest `ts`. */
export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

const dateFmt = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });
const dateFmtYear = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });

export function fmtDate(ts: number): string {
  const sameYear = new Date(ts).getFullYear() === new Date().getFullYear();
  return sameYear ? dateFmt.format(ts) : dateFmtYear.format(ts);
}
export function fmtShortDate(ts: number): string {
  return shortFmt.format(ts);
}
export function fmtTime(ts: number): string {
  return timeFmt.format(ts);
}

/** „dziś”, „wczoraj”, „3 dni temu”, po tygodniu data. */
export function fmtRelDay(ts: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (days <= 0) return 'dziś';
  if (days === 1) return 'wczoraj';
  if (days < 7) return `${plural(days, W.day)} temu`;
  return fmtDate(ts);
}

/** Wartość do pola edycji: przecinek dziesiętny, bez spacji tysięcy („1000,5”). */
export function fmtInput(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

export function fmtDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const hrs = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${hrs} h ${rest} min` : `${hrs} h`;
}

/** 83 → „1:23”; 3725 → „1:02:05”. */
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const hrs = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = hrs ? String(min).padStart(2, '0') : String(min);
  return `${hrs ? `${hrs}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args: Parameters<T>) => {
    clearTimeout(t);
    fn(...args);
  };
  return wrapped;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
