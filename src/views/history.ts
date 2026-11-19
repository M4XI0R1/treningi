import { app } from '../app';
import { isHistoryPR, workoutPRCount, workoutTotals } from '../stats';
import { deleteWorkout, getExercise, state } from '../store';
import type { Workout } from '../types';
import { catBadge, categoryOf } from '../ui/category';
import { confirmSheet } from '../ui/sheet';
import { toast } from '../ui/toast';
import { W, fmtDate, fmtDuration, fmtKg, fmtLoad, fmtNum, fmtRelDay, fmtTime, h, icon, plural } from '../util';

const PAGE = 40;
let shown = PAGE;
const expanded = new Set<string>();
/** Filtr po nazwie treningu (null = wszystkie). */
let filter: string | null = null;

export function renderHistory(root: HTMLElement) {
  const names: string[] = [];
  for (const w of state.workouts) if (!names.includes(w.name)) names.push(w.name);
  // Kolejność filtrów jak w planie, potem pozostałe nazwy.
  const planOrder = state.plans.map((p) => p.name);
  names.sort((a, b) => (planOrder.indexOf(a) + 1 || 999) - (planOrder.indexOf(b) + 1 || 999));
  if (filter && !names.includes(filter)) filter = null;
  const all = filter ? state.workouts.filter((w) => w.name === filter) : state.workouts;
  root.append(
    h(
      'header',
      { class: 'page-header' },
      h(
        'div',
        { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, 'Historia'),
        state.workouts.length > 0 && h('p', { class: 'page-sub' }, plural(all.length, W.workout)),
      ),
    ),
  );
  if (names.length > 1) {
    const chip = (label: string, value: string | null) =>
      h(
        'button',
        {
          class: `chip${filter === value ? ' is-active' : ''}`,
          'aria-pressed': String(filter === value),
          onclick: () => {
            filter = value;
            shown = PAGE;
            app.rerender();
          },
        },
        label,
      );
    root.append(h('div', { class: 'chips chips-scroll', role: 'group', 'aria-label': 'Filtr treningów' }, chip('Wszystkie', null), names.map((n) => chip(n, n))));
  }
  if (!state.workouts.length) {
    root.append(
      h(
        'div',
        { class: 'empty' },
        h('p', { class: 'empty-title' }, 'Jeszcze nic tu nie ma'),
        h('p', { class: 'empty-text' }, 'Zakończone treningi pojawią się tutaj, od najnowszych.'),
        h('button', { class: 'btn btn-secondary', onclick: () => app.go('trening') }, 'Zacznij trening'),
      ),
    );
    return;
  }
  const list = h('div', { class: 'stack' });
  for (const w of all.slice(0, shown)) list.append(historyCard(w));
  root.append(list);
  if (all.length > shown) {
    const more = Math.min(PAGE, all.length - shown);
    root.append(
      h(
        'button',
        {
          class: 'btn btn-block btn-secondary mt-16',
          onclick: () => {
            shown += PAGE;
            app.rerender();
          },
        },
        `Pokaż ${plural(more, ['kolejny', 'kolejne', 'kolejnych'])}`,
      ),
      h('p', { class: 'footnote' }, `Wyświetlono ${fmtNum(shown)} z ${fmtNum(all.length)}.`),
    );
  }
}

function historyCard(w: Workout): HTMLElement {
  const t = workoutTotals(w);
  const prs = workoutPRCount(w);
  const open = expanded.has(w.id);
  const card = h('article', { class: `card hist-card${open ? ' is-open' : ''}` });

  const head = h(
    'button',
    {
      class: 'hist-head',
      'aria-expanded': String(open),
      onclick: () => {
        if (expanded.has(w.id)) expanded.delete(w.id);
        else expanded.add(w.id);
        // Bez animacji rozwijania: lista jest przeglądana często, treść ma być od razu.
        card.replaceWith(historyCard(w));
      },
    },
    catBadge(categoryOf(w.planId, w.name)),
    h(
      'div',
      { class: 'hist-head-text' },
      h(
        'span',
        { class: 'hist-date' },
        fmtRelDay(w.startedAt) === fmtDate(w.startedAt) ? fmtDate(w.startedAt) : `${fmtDate(w.startedAt)} · ${fmtRelDay(w.startedAt)}`,
      ),
      h('span', { class: 'hist-name-row' }, h('span', { class: 'hist-name' }, w.name), prs > 0 && h('span', { class: 'badge badge-accent badge-sm' }, icon('trophy', 12), fmtNum(prs))),
      h(
        'span',
        { class: 'hist-meta' },
        `${fmtDuration(w.endedAt - w.startedAt)} · ${plural(t.sets, W.set)} · ${fmtKg(Math.round(t.volume))}`,
      ),
    ),
    h('span', { class: 'hist-chevron' }, icon(open ? 'chevronUp' : 'chevronDown', 16)),
  );
  card.append(head);
  if (!open) return card;

  const body = h('div', { class: 'hist-body' });
  for (const ex of w.exercises) {
    const e = getExercise(ex.exerciseId);
    let n = 0;
    body.append(
      h(
        'div',
        { class: 'hist-ex' },
        h('p', { class: 'hist-ex-name' }, e.name),
        h(
          'ol',
          { class: 'hist-sets' },
          ex.sets.map((s) => {
            const pr = isHistoryPR(s.id);
            const label = s.warmup ? 'R' : String(++n);
            return h(
              'li',
              { class: `${s.warmup ? 'is-warmup' : ''}${pr ? ' is-pr' : ''}` },
              h('span', { class: 'hist-set-no num' }, label),
              h('span', { class: 'num' }, `${fmtLoad(s.weight)} × ${s.reps ?? 0}`),
              s.rir !== null && !s.warmup && h('span', { class: 'hist-rir num' }, `RIR ${s.rir}`),
              pr && h('span', { class: 'badge badge-accent badge-sm' }, 'Rekord'),
            );
          }),
        ),
      ),
    );
  }
  if (w.note) body.append(h('p', { class: 'hist-note' }, w.note));
  body.append(
    h(
      'p',
      { class: 'footnote' },
      `${fmtTime(w.startedAt)}–${fmtTime(w.endedAt)} · ${plural(w.exercises.length, W.exercise)}`,
    ),
    h(
      'button',
      {
        class: 'btn btn-block btn-ghost-danger',
        onclick: async () => {
          const ok = await confirmSheet({
            title: 'Usunąć trening?',
            message: `${w.name}, ${fmtDate(w.startedAt)}. Zniknie z historii, wykresów i rekordów. Tego nie da się cofnąć.`,
            confirmLabel: 'Usuń trening',
            danger: true,
          });
          if (!ok) return;
          expanded.delete(w.id);
          await deleteWorkout(w.id);
          app.rerender();
          toast('Trening usunięty.');
        },
      },
      'Usuń trening',
    ),
  );
  card.append(body);
  return card;
}
