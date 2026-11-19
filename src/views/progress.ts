import { columnChart, lineChart } from '../charts';
import { exerciseRecords, exerciseSeries, exercisesWithHistory, muscleSets7d, weeklyCounts } from '../stats';
import { LIMITS, addBodyweight, getExercise, state, undoBodyweight } from '../store';
import { MUSCLES } from '../types';
import { confirmSheet } from '../ui/sheet';
import { toast } from '../ui/toast';
import { app } from '../app';
import { W, clamp, fmtDate, fmtKg, fmtNum, fmtShortDate, h, parseNum, plural, round } from '../util';

type Metric = 'e1rm' | 'maxWeight' | 'volume' | 'maxReps' | 'totalReps';
const LOADED: { id: Metric; label: string; unit: string }[] = [
  { id: 'e1rm', label: 'Szac. 1RM', unit: 'kg' },
  { id: 'maxWeight', label: 'Maks. kg', unit: 'kg' },
  { id: 'volume', label: 'Objętość', unit: 'kg' },
];
/** Ćwiczenia z masą ciała (zawsze 0 kg): 1RM i objętość nic nie mówią, liczymy powtórzenia. */
const BODYWEIGHT: { id: Metric; label: string; unit: string }[] = [
  { id: 'maxReps', label: 'Najlepsza seria', unit: 'powt.' },
  { id: 'totalReps', label: 'Suma powtórzeń', unit: 'powt.' },
];

let selectedExercise: string | null = null;
let metric: Metric = 'e1rm';
/** Poprzednia pozycja kciuka segmentu, żeby po przebudowie widoku przesunął się z niej, a nie pojawił. */
let prevSegment = 0;

export function renderProgress(root: HTMLElement) {
  root.append(h('header', { class: 'page-header' }, h('h1', { class: 'page-title' }, 'Progres')));
  root.append(exerciseSection(), muscleSection(), weeklySection(), bodyweightSection());
}

function section(title: string, ...children: (Node | null | false)[]) {
  return h('section', { class: 'section' }, h('h2', { class: 'section-title' }, title), ...children);
}

// ---------- Ćwiczenie ----------

function exerciseSection() {
  const ids = exercisesWithHistory();
  if (!ids.length) {
    return section(
      'Ćwiczenie',
      h(
        'div',
        { class: 'card empty-card' },
        h('p', { class: 'empty-title' }, 'Brak danych'),
        h('p', { class: 'empty-text' }, 'Wykresy pojawią się po pierwszym zapisanym treningu.'),
      ),
    );
  }
  if (!selectedExercise || !ids.includes(selectedExercise)) selectedExercise = ids[0];
  const exId = selectedExercise;

  const sorted = [...ids].sort((a, b) => getExercise(a).name.localeCompare(getExercise(b).name, 'pl'));
  const select = h(
    'select',
    {
      class: 'input select select-card',
      'aria-label': 'Ćwiczenie',
      onchange: (e: Event) => {
        selectedExercise = (e.target as HTMLSelectElement).value;
        app.rerender();
      },
    },
    sorted.map((id) => {
      const opt = h('option', { value: id }, getExercise(id).name);
      opt.selected = id === exId;
      return opt;
    }),
  );

  const series = exerciseSeries(exId);
  const bodyweightOnly = series.every((p) => p.maxWeight === 0);
  const METRICS = bodyweightOnly ? BODYWEIGHT : LOADED;
  const current = METRICS.find((m) => m.id === metric) ?? METRICS[0];
  const key = current.id;
  const points = series.map((p) => ({ x: p.date, y: p[key] }));
  const fmt = (v: number) =>
    key === 'volume' || key === 'totalReps' || key === 'maxReps' ? fmtNum(Math.round(v)) : fmtNum(round(v, 0.5));
  const unit = current.unit;
  const latest = points[points.length - 1]?.y ?? 0;
  const first = points[0]?.y ?? 0;
  const diff = latest - first;

  const activeIdx = METRICS.findIndex((m) => m.id === key);
  const thumb = h('div', { class: 'segmented-thumb', 'aria-hidden': 'true' });
  const fromIdx = Math.min(prevSegment, METRICS.length - 1);
  thumb.style.transform = `translateX(${fromIdx * 100}%)`;
  if (fromIdx !== activeIdx) {
    // Kciuk startuje z poprzedniego segmentu i przesuwa się do nowego (po wstawieniu do DOM).
    requestAnimationFrame(() => requestAnimationFrame(() => (thumb.style.transform = `translateX(${activeIdx * 100}%)`)));
  }
  prevSegment = activeIdx;
  const seg = h(
    'div',
    { class: 'segmented has-thumb', style: `--n:${METRICS.length}`, role: 'group', 'aria-label': 'Miara' },
    thumb,
    METRICS.map((m) =>
      h(
        'button',
        {
          class: `segment${m.id === key ? ' is-active' : ''}`,
          'aria-pressed': String(m.id === key),
          onclick: () => {
            if (m.id === key) return;
            metric = m.id;
            app.rerender();
          },
        },
        m.label,
      ),
    ),
  );

  const rec = exerciseRecords(exId);
  const bestTotal = Math.max(0, ...series.map((p) => p.totalReps));
  const records = bodyweightOnly
    ? h(
        'div',
        { class: 'records' },
        recordTile('Najwięcej powt.', rec.maxReps ? String(rec.maxReps.reps) : '–', rec.maxReps ? fmtShortDate(rec.maxReps.date) : ''),
        recordTile('Suma w treningu', fmtNum(bestTotal), plural(rec.sessions, W.workout)),
      )
    : h(
    'div',
    { class: 'records' },
    recordTile(
      'Szac. 1RM',
      rec.bestE1rm ? fmtKg(round(rec.bestE1rm.value, 0.5)) : '–',
      rec.bestE1rm ? `${fmtNum(rec.bestE1rm.weight)} × ${rec.bestE1rm.reps} · ${fmtShortDate(rec.bestE1rm.date)}` : '',
    ),
    recordTile(
      'Maks. ciężar',
      rec.maxWeight ? fmtKg(rec.maxWeight.weight) : '–',
      rec.maxWeight ? `× ${rec.maxWeight.reps} · ${fmtShortDate(rec.maxWeight.date)}` : '',
    ),
    recordTile(
      'Najwięcej powt.',
      rec.maxReps ? String(rec.maxReps.reps) : '–',
      rec.maxReps ? `${fmtKg(rec.maxReps.weight)} · ${fmtShortDate(rec.maxReps.date)}` : '',
    ),
    recordTile(
      'Objętość (trening)',
      rec.bestVolume ? fmtKg(Math.round(rec.bestVolume.value)) : '–',
      rec.bestVolume ? fmtShortDate(rec.bestVolume.date) : '',
    ),
  );

  return section(
    'Ćwiczenie',
    select,
    seg,
    h(
      'div',
      { class: 'card chart-card' },
      h(
        'div',
        { class: 'chart-head' },
        h('span', { class: 'chart-value num' }, `${fmt(latest)} ${unit}`),
        points.length > 1 &&
          h(
            'span',
            { class: `delta num${diff > 0 ? ' is-up' : diff < 0 ? ' is-down' : ''}` },
            `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${fmt(Math.abs(diff))} ${unit} od początku`,
          ),
      ),
      h('p', { class: 'chart-sub' }, `${plural(series.length, W.workout)} · dotknij wykresu, by zobaczyć wartość`),
      lineChart(points, {
        format: fmt,
        formatX: fmtShortDate,
        label: `Wykres: ${current.label}`,
      }),
    ),
    h('h3', { class: 'sub-title' }, 'Rekordy'),
    records,
  );
}

function recordTile(label: string, value: string, sub: string) {
  return h(
    'div',
    { class: 'record' },
    h('span', { class: 'record-label' }, label),
    h('span', { class: 'record-value num' }, value),
    sub && h('span', { class: 'record-sub num' }, sub),
  );
}

// ---------- Serie na partię ----------

function muscleSection() {
  const counts = muscleSets7d();
  const max = Math.max(20, ...counts.values());
  const lo = 10;
  const hi = 16;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-title' }, 'Serie na partię (7 dni)'),
      h('span', { class: 'section-aside num' }, `Łącznie ${plural(total, W.set)}`),
    ),
    h(
      'div',
      { class: 'card' },
      h(
        'ul',
        { class: 'muscles' },
        MUSCLES.map((m) => {
          const n = counts.get(m) ?? 0;
          const zone = n < lo ? 'low' : n > hi ? 'high' : 'ok';
          return h(
            'li',
            { class: `muscle is-${zone}` },
            h('span', { class: 'muscle-name' }, m),
            h('span', { class: 'muscle-count num' }, plural(n, W.set)),
            h(
              'div',
              { class: 'muscle-track' },
              h('div', { class: 'muscle-band', style: `left:${(lo / max) * 100}%;width:${((hi - lo) / max) * 100}%` }),
              h('div', { class: 'muscle-bar', style: `width:${(n / max) * 100}%` }),
            ),
          );
        }),
      ),
      h('p', { class: 'footnote' }, 'Jasne pole na pasku: 10–16 serii roboczych w tygodniu. Rozgrzewki się nie liczą.'),
    ),
  );
}

// ---------- Treningi na tydzień ----------

function weeklySection() {
  const weeks = weeklyCounts(8);
  const total = weeks.reduce((s, w) => s + w.count, 0);
  return section(
    'Treningi w tygodniu',
    h(
      'div',
      { class: 'card' },
      columnChart(
        weeks.map((w, i) => ({
          label: new Date(w.week).toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric' }),
          value: w.count,
          current: i === weeks.length - 1,
        })),
        'Liczba treningów w ostatnich 8 tygodniach',
      ),
      h('p', { class: 'footnote' }, `Ostatnie 8 tygodni: ${plural(total, W.workout)}. Tydzień od poniedziałku.`),
    ),
  );
}

// ---------- Waga ciała ----------

function bodyweightSection() {
  const entries = state.bodyweight;
  const last = entries[entries.length - 1];
  const first = entries[0];
  const input = h('input', {
    class: 'input num',
    type: 'text',
    inputMode: 'decimal',
    enterKeyHint: 'done',
    autocomplete: 'off',
    maxlength: '6',
    placeholder: last ? fmtNum(last.kg) : 'np. 80,5',
    'aria-label': 'Waga ciała w kg',
  });
  const submit = async () => {
    const n = parseNum(input.value || (last ? String(last.kg) : ''));
    if (n === null || n < 20 || n > LIMITS.bodyweight) {
      toast('Wpisz wagę od 20 do 400 kg.');
      input.focus();
      return;
    }
    await addBodyweight(round(clamp(n, 20, LIMITS.bodyweight), 0.01));
    app.rerender();
    toast(`Zapisano: ${fmtKg(n)}`);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  });

  const diff = last && first ? last.kg - first.kg : 0;
  return section(
    'Waga ciała',
    h(
      'div',
      { class: 'card' },
      last
        ? h(
            'div',
            { class: 'chart-head' },
            h('span', { class: 'chart-value num' }, fmtKg(last.kg)),
            entries.length > 1 &&
              h(
                'span',
                { class: 'delta delta-neutral num' },
                `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${fmtNum(Math.abs(round(diff, 0.1)))} kg od ${fmtShortDate(first.date)}`,
              ),
          )
        : h('p', { class: 'empty-text' }, 'Dodaj pierwszy pomiar.'),
      last && h('p', { class: 'chart-sub' }, `${plural(entries.length, W.entry)} · ostatni ${fmtDate(last.date)}`),
      entries.length > 0 &&
        lineChart(
          entries.map((e) => ({ x: e.date, y: e.kg })),
          { format: (v) => fmtNum(round(v, 0.1)), formatX: fmtShortDate, height: 150, label: 'Wykres wagi ciała' },
        ),
      h(
        'div',
        { class: 'inline-form' },
        input,
        h('button', { class: 'btn btn-primary', onclick: submit }, 'Dodaj'),
      ),
      last &&
        h(
          'button',
          {
            class: 'btn btn-block btn-tertiary',
            onclick: async () => {
              const ok = await confirmSheet({
                title: 'Cofnąć ostatni wpis?',
                message: `${fmtKg(last.kg)}, ${fmtDate(last.date)}.`,
                confirmLabel: 'Usuń wpis',
                danger: true,
              });
              if (!ok) return;
              await undoBodyweight();
              app.rerender();
            },
          },
          'Cofnij ostatni wpis',
        ),
    ),
  );
}
