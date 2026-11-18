import { app } from '../app';
import { isHistoryPR, workoutPRCount, workoutTotals } from '../stats';
import { deleteWorkout, getExercise, state } from '../store';
import type { Workout } from '../types';
import { confirmSheet } from '../ui/sheet';
import { toast } from '../ui/toast';
import { W, fmtDate, fmtDuration, fmtKg, fmtLoad, fmtNum, fmtRelDay, fmtTime, h, icon, plural } from '../util';

const PAGE = 40;
let shown = PAGE;
const expanded = new Set<string>();

export function renderHistory(root: HTMLElement) {
  const all = state.workouts;
  root.append(
    h(
      'header',
      { class: 'page-header' },
      h('h1', { class: 'page-title' }, 'Historia'),
      all.length > 0 && h('p', { class: 'page-sub' }, plural(all.length, W.workout)),
    ),
  );
  if (!all.length) {
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
    h(
      'div',
      { class: 'hist-head-text' },
      h(
        'span',
        { class: 'hist-date' },
        Date.now() - w.startedAt < 7 * 86_400_000 ? `${fmtDate(w.startedAt)} · ${fmtRelDay(w.startedAt)}` : fmtDate(w.startedAt),
      ),
      h('span', { class: 'hist-name' }, w.name),
      h(
        'span',
        { class: 'hist-meta' },
        `${fmtDuration(w.endedAt - w.startedAt)} · ${plural(t.sets, W.set)} · ${fmtKg(Math.round(t.volume))}`,
      ),
    ),
    prs > 0 && h('span', { class: 'badge badge-accent' }, icon('trophy', 14), fmtNum(prs)),
    h('span', { class: 'hist-chevron' }, icon('chevron', 18)),
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
              s.rir !== null && h('span', { class: 'hist-rir num' }, `RIR ${s.rir}`),
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
