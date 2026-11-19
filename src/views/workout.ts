import { app } from '../app';
import { addRest, skipRest, startRest, syncRest, unlockAudio } from '../rest';
import { REST_OPTIONS } from '../defaults';
import { draftPRs, e1rm, lastDoneByPlan, lastSets, nextPlanId, planDuration, workoutTotals } from '../stats';
import { type Category, catBadge, categoryOf, planCategory } from '../ui/category';
import {
  LIMITS,
  cleanName,
  createExercise,
  discardDraft,
  finishDraft,
  flushDraft,
  getExercise,
  saveDraft,
  saveSettings,
  state,
} from '../store';
import { MUSCLES, type Draft, type Muscle, type Plan, type SetEntry, type WorkoutExercise } from '../types';
import { confirmSheet, openSheet } from '../ui/sheet';
import { toast } from '../ui/toast';
import { openPlates } from './plates';
import {
  W,
  clamp,
  fmtClock,
  fmtDuration,
  fmtInput,
  fmtKg,
  fmtLoad,
  fmtNum,
  fmtRelDay,
  h,
  icon,
  parseNum,
  plural,
  round,
  startOfWeek,
  svg,
  uid,
} from '../util';

const DAY = 86_400_000;

export function renderTraining(root: HTMLElement) {
  if (state.draft) renderActive(root, state.draft);
  else renderPlans(root);
}

// =====================================================================
// Lista treningów
// =====================================================================

function renderPlans(root: HTMLElement) {
  const next = nextPlanId();
  const lastByPlan = lastDoneByPlan();
  const exportAge = state.settings.lastExportAt ? Date.now() - state.settings.lastExportAt : Infinity;
  const needsBackup = state.workouts.length > 0 && exportAge > 14 * DAY;
  const nextPlan = state.plans.find((p) => p.id === next) ?? null;
  const others = state.plans.filter((p) => p !== nextPlan);

  root.append(
    h(
      'header',
      { class: 'page-header' },
      h(
        'div',
        { class: 'page-header-text' },
        h('p', { class: 'eyebrow num' }, todayLabel()),
        h('h1', { class: 'page-title' }, 'Trening'),
      ),
      weekRing(),
    ),
    needsBackup
      ? h(
          'button',
          { class: 'card banner', onclick: () => app.go('plan', { top: false }) },
          h('span', { class: 'banner-icon' }, icon('backup', 18)),
          h(
            'span',
            { class: 'banner-text' },
            h('strong', null, 'Zrób kopię zapasową'),
            h(
              'span',
              null,
              state.settings.lastExportAt
                ? `Ostatni eksport ${fmtRelDay(state.settings.lastExportAt)}.`
                : 'Dane są tylko na tym telefonie.',
            ),
          ),
          icon('chevron', 18),
        )
      : '',
    nextPlan ? heroCard(nextPlan, lastByPlan.get(nextPlan.id)) : '',
    state.plans.length === 0
      ? h(
          'div',
          { class: 'card empty-card' },
          h('p', { class: 'empty-title' }, 'Brak treningów w planie'),
          h('p', { class: 'empty-text' }, 'Dodaj trening w zakładce Plan albo zacznij pusty trening.'),
          h('button', { class: 'btn btn-gray btn-sm mt-12', onclick: () => app.go('plan') }, 'Przejdź do planu'),
        )
      : '',
    others.length
      ? h(
          'section',
          { 'aria-label': 'Pozostałe treningi' },
          h(
            'div',
            { class: 'section-head' },
            h('h2', { class: 'section-title' }, nextPlan ? 'Pozostałe treningi' : 'Treningi'),
            h('span', { class: 'section-aside' }, plural(others.length, ['plan', 'plany', 'planów'])),
          ),
          h('div', { class: 'stack' }, others.map((plan) => planRow(plan, lastByPlan.get(plan.id)))),
        )
      : '',
    h(
      'button',
      { class: 'btn btn-block btn-secondary mt-16', onclick: () => startWorkout(null) },
      icon('plus', 20),
      'Pusty trening',
    ),
  );
}

function todayLabel() {
  return new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '');
}

/** Pierścień celu tygodnia (pon.–niedz.) z wyskakującym podsumowaniem dni. */
function weekRing() {
  const goal = state.settings.weeklyGoal ?? 4;
  const weekStart = startOfWeek(Date.now());
  const done = new Set<number>();
  let count = 0;
  for (const w of state.workouts) {
    if (w.startedAt < weekStart) break;
    count++;
    done.add((new Date(w.startedAt).getDay() + 6) % 7);
  }
  const today = (new Date().getDay() + 6) % 7;
  const r = 12;
  const len = 2 * Math.PI * r;
  const progress = Math.min(1, count / goal);
  const gradId = `ring-grad-${Math.random().toString(36).slice(2, 7)}`;
  const ringSvg = svg(
    'svg',
    { class: 'ring-svg', width: 30, height: 30, viewBox: '0 0 32 32', 'aria-hidden': 'true' },
    svg(
      'defs',
      {},
      svg(
        'linearGradient',
        { id: gradId, x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
        svg('stop', { offset: '0%', 'stop-color': 'var(--ring-start)' }),
        svg('stop', { offset: '100%', 'stop-color': 'var(--ring-end)' }),
      ),
    ),
    svg('circle', { cx: 16, cy: 16, r, fill: 'none', stroke: 'var(--ring-track)', 'stroke-width': 3.6 }),
    progress > 0 &&
      svg('circle', {
        cx: 16,
        cy: 16,
        r,
        fill: 'none',
        stroke: `url(#${gradId})`,
        'stroke-width': 3.6,
        'stroke-linecap': 'round',
        'stroke-dasharray': len.toFixed(2),
        'stroke-dashoffset': (len * (1 - progress)).toFixed(2),
      }),
  );

  const popover = h(
    'div',
    { class: 'popover', role: 'dialog', 'aria-label': 'Ten tydzień', dataset: { open: 'false' } },
    h('p', { class: 'popover-title num' }, `Ten tydzień: ${plural(count, W.workout)} · cel: ${goal}`),
    h(
      'div',
      { class: 'week-days' },
      ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'].map((d, i) =>
        h(
          'div',
          { class: `week-day${i === today ? ' is-today' : ''}` },
          h('span', null, d),
          h('span', { class: `week-mark${done.has(i) ? ' is-done' : ''}` }, done.has(i) ? '✓' : i < today ? '–' : ''),
        ),
      ),
    ),
    h('p', { class: 'footnote' }, 'Cel zmienisz w zakładce Plan → Ustawienia.'),
  );
  const btn = h(
    'button',
    {
      class: 'ring-btn',
      'aria-expanded': 'false',
      'aria-label': `Cel tygodnia: ${count} z ${goal}. Pokaż dni.`,
    },
    h('span', { class: 'ring' }, ringSvg, icon('bolt', 11)),
    h(
      'span',
      { class: 'ring-text' },
      h('span', { class: 'ring-value num' }, `${count}/${goal} tyg.`),
      h('span', { class: 'ring-label' }, 'Cel tygodnia'),
    ),
  );
  const setOpen = (open: boolean) => {
    popover.dataset.open = String(open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(popover.dataset.open !== 'true');
  });
  const outside = (e: Event) => {
    if (!btn.isConnected) return document.removeEventListener('pointerdown', outside);
    if (!popover.contains(e.target as Node) && !btn.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener('pointerdown', outside);
  return h('div', { class: 'ring-wrap' }, btn, popover);
}

function lastLabel(lastDone: number | undefined) {
  return lastDone ? `ostatnio ${fmtRelDay(lastDone)}` : 'jeszcze nie robiony';
}

function heroCard(plan: Plan, lastDone: number | undefined) {
  const cat = planCategory(plan);
  const names = plan.exercises.map((pe) => getExercise(pe.exerciseId).name);
  const shown = names.slice(0, 2);
  const more = names.length - shown.length;
  const dur = planDuration(plan);
  return h(
    'section',
    {
      class: 'card hero',
      'aria-label': 'Następny trening',
    },
    h(
      'div',
      { class: 'hero-top' },
      h('span', { class: 'status-pill' }, h('span', { class: 'status-dot' }), 'Następny trening'),
      h('span', { class: 'hero-aside num' }, `${plural(plan.exercises.length, W.exercise)} · ~${dur} min`),
    ),
    h(
      'div',
      { class: 'hero-main' },
      catBadge(cat, 'lg'),
      h(
        'div',
        { style: 'min-width:0' },
        h('h2', { class: 'hero-name' }, plan.name || 'Bez nazwy'),
        h('p', { class: 'hero-meta num' }, lastLabel(lastDone).replace(/^./, (c) => c.toUpperCase())),
      ),
    ),
    names.length > 0 &&
      h(
        'div',
        { class: 'chips-row' },
        shown.map((n) => h('span', { class: 'ex-chip' }, n)),
        more > 0 &&
          h(
            'button',
            { class: 'ex-chip ex-chip-more', onclick: () => planPreview(plan, true, lastDone) },
            `+${more} więcej`,
          ),
      ),
    h(
      'button',
      { class: 'btn btn-block btn-primary', onclick: () => startWorkout(plan) },
      icon('play', 16),
      'Rozpocznij trening',
    ),
  );
}

function planRow(plan: Plan, lastDone: number | undefined) {
  const names = plan.exercises.map((pe) => getExercise(pe.exerciseId).name);
  return h(
    'button',
    {
      class: 'card plan-row',
      onclick: () => planPreview(plan, false, lastDone),
      'aria-label': `${plan.name}: podgląd i start`,
    },
    catBadge(planCategory(plan)),
    h(
      'span',
      { class: 'plan-row-body' },
      h(
        'span',
        { class: 'plan-row-top' },
        h('span', { class: 'plan-row-name' }, plan.name || 'Bez nazwy'),
        h('span', { class: 'plan-row-time num' }, `~${planDuration(plan)} min`),
      ),
      h('span', { class: 'plan-row-meta', style: 'display:block' }, `${plural(plan.exercises.length, W.exercise)} · ${lastLabel(lastDone)}`),
      names.length > 0 && h('span', { class: 'plan-row-list', style: 'display:block' }, names.join(' · ')),
    ),
    icon('chevron', 18),
  );
}

/** Podgląd planu przed startem: chroni przed przypadkowym rozpoczęciem treningu. */
function planPreview(plan: Plan, isNext: boolean, lastDone: number | undefined) {
  const sets = plan.exercises.reduce((n, pe) => n + pe.sets, 0);
  const sheet = openSheet({
    title: plan.name || 'Bez nazwy',
    subtitle: lastLabel(lastDone).replace(/^./, (c) => c.toUpperCase()),
    leading: catBadge(planCategory(plan), 'lg'),
    titleAside: isNext ? h('span', { class: 'badge badge-accent badge-sm' }, 'NASTĘPNY') : null,
    content: [
      h(
        'div',
        { class: 'stat-grid' },
        stat('Ćwiczenia', fmtNum(plan.exercises.length)),
        stat('Serie', fmtNum(sets)),
        stat('Szac. czas', `~${planDuration(plan)} min`),
      ),
      plan.exercises.length
        ? h(
            'ul',
            { class: 'card rows-card' },
            plan.exercises.map((pe) =>
              h(
                'li',
                null,
                h('span', { class: 'row-name' }, getExercise(pe.exerciseId).name),
                h('span', { class: 'row-target' }, `${pe.sets} × ${pe.repsMin === pe.repsMax ? pe.repsMin : `${pe.repsMin}–${pe.repsMax}`}`),
              ),
            ),
          )
        : h('p', { class: 'sheet-text' }, 'Ten trening nie ma jeszcze ćwiczeń. Dodasz je w trakcie.'),
      h(
        'button',
        {
          class: 'btn btn-block btn-primary',
          onclick: () => {
            void sheet.close();
            startWorkout(plan);
          },
        },
        icon('play', 16),
        'Rozpocznij trening',
      ),
    ],
  });
}

function startWorkout(plan: Plan | null) {
  unlockAudio();
  const draft: Draft = {
    id: uid(),
    planId: plan?.id ?? null,
    name: plan?.name || 'Własny trening',
    startedAt: Date.now(),
    note: '',
    restEndsAt: null,
    restTotal: state.settings.restSeconds,
    exercises: (plan?.exercises ?? []).map((pe) => ({
      id: uid(),
      exerciseId: pe.exerciseId,
      target: `${pe.sets} × ${pe.repsMin === pe.repsMax ? pe.repsMin : `${pe.repsMin}–${pe.repsMax}`}`,
      sets: Array.from({ length: pe.sets }, emptySet),
    })),
  };
  state.draft = draft;
  flushDraft();
  app.go('trening', { top: true });
}

function emptySet(): SetEntry {
  return { id: uid(), weight: null, reps: null, rir: null, done: false, warmup: false };
}

// =====================================================================
// Trwający trening
// =====================================================================

let clockTimer: ReturnType<typeof setInterval> | undefined;

function renderActive(root: HTMLElement, draft: Draft) {
  const time = h('span', { class: 'num' }, fmtClock((Date.now() - draft.startedAt) / 1000));
  const stats = h('span', null);
  const updateStats = () => {
    const t = workoutTotals(draft);
    stats.textContent = t.sets ? ` · ${plural(t.sets, W.set)}` : '';
  };
  updateStats();
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    if (!time.isConnected) return clearInterval(clockTimer);
    time.textContent = fmtClock((Date.now() - draft.startedAt) / 1000);
  }, 1000);

  const list = h('div', { class: 'stack' });
  const cat = categoryOf(draft.planId, draft.name);
  const ctx: CardCtx = { draft, list, updateStats, cat };
  for (const we of draft.exercises) list.append(exerciseCard(ctx, we));

  const note = h('textarea', {
    class: 'input textarea',
    placeholder: 'Notatka do treningu (samopoczucie, sprzęt, ból…)',
    maxlength: String(LIMITS.note),
    rows: 2,
    value: draft.note,
    oninput: (e: Event) => {
      draft.note = (e.target as HTMLTextAreaElement).value;
      saveDraft();
    },
  });

  root.append(
    h(
      'header',
      { class: 'workout-header' },
      h(
        'div',
        { class: 'workout-header-text' },
        h(
          'div',
          { class: 'workout-title-row' },
          h('h1', { class: 'workout-title' }, draft.name),
          h('span', { class: `cat-dot cat-${cat}`, 'aria-hidden': 'true' }),
        ),
        h('p', { class: 'workout-sub' }, time, stats),
      ),
      h(
        'button',
        { class: 'round-btn', 'aria-label': 'Opcje treningu', onclick: () => workoutMenu(draft) },
        icon('more', 18),
      ),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => finishFlow(draft) }, 'Zakończ'),
    ),
    draft.exercises.length === 0
      ? h(
          'div',
          { class: 'empty' },
          h('p', { class: 'empty-title' }, 'Pusty trening'),
          h('p', { class: 'empty-text' }, 'Dodaj pierwsze ćwiczenie.'),
        )
      : '',
    list,
    h(
      'button',
      { class: 'btn btn-block btn-secondary mt-12', onclick: () => addExerciseSheet(ctx) },
      icon('plus', 20),
      'Dodaj ćwiczenie',
    ),
    h('label', { class: 'field mt-16' }, h('span', { class: 'field-label' }, 'Notatka'), note),
    h(
      'button',
      { class: 'btn btn-block btn-ghost-danger mt-12', onclick: () => discardFlow() },
      'Odrzuć trening',
    ),
  );
}

interface CardCtx {
  cat: Category;
  draft: Draft;
  list: HTMLElement;
  updateStats: () => void;
}

/** Podpowiedź z poprzedniego treningu: seria o tym samym numerze, potem ostatnia. */
/**
 * Podpowiedź dla serii: ta sama seria (licząc osobno robocze i rozgrzewkowe) z poprzedniego treningu,
 * potem poprzednia wpisana seria tego samego rodzaju, na końcu ostatnia seria tego rodzaju z poprzedniego razu.
 */
function hintFor(prev: SetEntry[] | null, we: WorkoutExercise, index: number): SetEntry | null {
  const current = we.sets[index];
  const sameKind = (s: SetEntry) => s.warmup === current.warmup;
  const nth = we.sets.slice(0, index).filter(sameKind).length;
  const prevSame = prev?.filter(sameKind) ?? [];
  if (prevSame[nth]) return prevSame[nth];
  const before = we.sets
    .slice(0, index)
    .reverse()
    .find((s) => sameKind(s) && (s.done || s.weight !== null || s.reps !== null));
  if (before) return before;
  return prevSame[prevSame.length - 1] ?? null;
}

function exerciseCard(ctx: CardCtx, we: WorkoutExercise): HTMLElement {
  const ex = getExercise(we.exerciseId);
  const prev = lastSets(we.exerciseId);
  const prs = draftPRs(ctx.draft.exercises);
  const prevWorking = prev?.filter((s) => !s.warmup) ?? [];
  const summary = (prevWorking.length ? prevWorking : prev ?? [])
    .map((s) => `${fmtLoad(s.weight, true)}×${s.reps ?? 0}`)
    .join(', ');

  const rows = h('div', { class: 'sets' });
  const updaters: (() => void)[] = [];
  /** Podpowiedzi (placeholdery) kolejnych serii zależą od wpisów w poprzednich. */
  const refreshHints = () => updaters.forEach((fn) => fn());
  let workNo = 0;
  we.sets.forEach((set, i) => {
    if (!set.warmup) workNo++;
    const [row, pr, update] = setRow(ctx, we, set, set.warmup ? 'R' : String(workNo), () => hintFor(prev, we, i), prs.has(set.id), refreshHints);
    updaters.push(update);
    rows.append(row, pr);
  });

  const card = h(
    'section',
    { class: 'card ex-card', dataset: { id: we.id } },
    h(
      'div',
      { class: 'ex-head' },
      h(
        'div',
        { class: 'ex-head-text' },
        h('h2', { class: 'ex-name' }, ex.name),
        h('span', { class: `ex-chip-muscle cat-${ctx.cat}` }, [ex.muscle, we.target].filter(Boolean).join(' · ')),
      ),
      h(
        'button',
        { class: 'icon-btn', 'aria-label': `Opcje: ${ex.name}`, onclick: () => exerciseMenu(ctx, we) },
        icon('more'),
      ),
    ),
    h('p', { class: 'ex-last' }, summary ? `Ostatnio: ${summary}` : 'Pierwszy raz: brak poprzedniego wyniku'),
    h(
      'div',
      { class: 'sets-head', 'aria-hidden': 'true' },
      h('span', null, 'Seria'),
      h('span', null, 'kg'),
      h('span', null, 'Powt.'),
      h('span', null, 'RIR'),
      h('span', null, ''),
    ),
    rows,
    h(
      'button',
      {
        class: 'btn btn-block btn-tertiary',
        onclick: () => {
          we.sets.push(emptySet());
          saveDraft();
          rerenderCard(ctx, we);
        },
      },
      icon('plus', 18),
      'Seria',
    ),
  );
  return card;
}

function rerenderCard(ctx: CardCtx, we: WorkoutExercise) {
  const old = ctx.list.querySelector<HTMLElement>(`[data-id="${we.id}"]`);
  const fresh = exerciseCard(ctx, we);
  if (old) old.replaceWith(fresh);
  else ctx.list.append(fresh);
  ctx.updateStats();
  return fresh;
}

/** Odświeża oznaczenia rekordów bez przebudowy kart (zachowuje fokus w polach). */
function refreshPRs(ctx: CardCtx) {
  const prs = draftPRs(ctx.draft.exercises);
  for (const we of ctx.draft.exercises) {
    for (const s of we.sets) {
      const badge = ctx.list.querySelector<HTMLElement>(`[data-pr="${s.id}"]`);
      if (!badge) continue;
      const on = prs.has(s.id);
      badge.hidden = !on;
      if (on) badge.lastChild!.textContent = `Rekord · szac. 1RM ${fmtKg(round(e1rm(s.weight, s.reps), 0.1))}`;
    }
  }
}

function setRow(
  ctx: CardCtx,
  we: WorkoutExercise,
  set: SetEntry,
  label: string,
  getHint: () => SetEntry | null,
  isPR: boolean,
  refreshHints: () => void,
): [HTMLElement, HTMLElement, () => void] {
  const hint = getHint();
  const row = h('div', { class: `set-row${set.done ? ' is-done' : ''}${set.warmup ? ' is-warmup' : ''}` });

  const mk = (
    field: 'weight' | 'reps' | 'rir',
    opts: { mode: string; max: number; step: number; placeholder: string; aria: string; maxlength: number },
  ) => {
    const input = h('input', {
      class: 'set-input num',
      type: 'text',
      inputMode: opts.mode,
      enterKeyHint: field === 'rir' ? 'done' : 'next',
      autocomplete: 'off',
      maxlength: String(opts.maxlength),
      placeholder: opts.placeholder,
      'aria-label': `${opts.aria}, seria ${label}`,
      value: set[field] === null ? '' : fmtInput(set[field]!),
    });
    if (field !== 'weight') input.setAttribute('pattern', '[0-9]*');
    input.addEventListener('focus', () => requestAnimationFrame(() => input.select()));
    input.addEventListener('input', () => {
      const n = parseNum(input.value);
      set[field] = n === null ? null : clamp(n, 0, opts.max);
      saveDraft();
      refreshHints();
      if (set.done) {
        refreshPRs(ctx);
        ctx.updateStats();
      }
    });
    input.addEventListener('change', () => {
      const n = parseNum(input.value);
      if (n === null) {
        set[field] = null;
        input.value = '';
      } else {
        const v = round(clamp(n, 0, opts.max), opts.step);
        set[field] = v;
        input.value = fmtInput(v);
      }
      saveDraft();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const inputs = [...row.querySelectorAll<HTMLInputElement>('input')];
      const next = inputs[inputs.indexOf(input) + 1];
      if (next) next.focus();
      else input.blur();
    });
    return input;
  };

  const kg = mk('weight', {
    mode: 'decimal',
    max: LIMITS.weight,
    step: 0.01,
    placeholder: hint?.weight != null ? fmtNum(hint.weight) : 'kg',
    aria: 'Ciężar w kg',
    maxlength: 7,
  });
  const reps = mk('reps', {
    mode: 'numeric',
    max: LIMITS.reps,
    step: 1,
    placeholder: hint?.reps != null ? String(hint.reps) : 'powt.',
    aria: 'Powtórzenia',
    maxlength: 3,
  });
  const rir = mk('rir', {
    mode: 'numeric',
    max: LIMITS.rir,
    step: 1,
    placeholder: hint?.rir != null ? String(hint.rir) : '–',
    aria: 'RIR',
    maxlength: 2,
  });

  const labelBtn = h(
    'button',
    {
      class: 'set-label',
      'aria-label': set.warmup ? 'Seria rozgrzewkowa. Tapnij, by zmienić na roboczą' : `Seria ${label}. Tapnij, by oznaczyć jako rozgrzewkę`,
      onclick: () => {
        set.warmup = !set.warmup;
        saveDraft();
        rerenderCard(ctx, we);
      },
    },
    label,
  );

  const check = h(
    'button',
    {
      class: 'set-check',
      'aria-pressed': String(set.done),
      'aria-label': set.done ? `Cofnij zaliczenie serii ${label}` : `Zalicz serię ${label}`,
    },
    icon('check', 22),
  );
  check.addEventListener('click', () => {
    unlockAudio();
    if (!set.done) {
      const hint = getHint();
      if (set.weight === null && hint?.weight != null) set.weight = hint.weight;
      if (set.reps === null && hint?.reps != null) set.reps = hint.reps;
      if (set.weight === null) {
        toast('Wpisz ciężar (0 dla masy ciała).');
        kg.focus();
        return;
      }
      if (set.reps === null || set.reps <= 0) {
        toast('Wpisz liczbę powtórzeń.');
        reps.focus();
        return;
      }
      kg.value = fmtInput(set.weight);
      reps.value = String(set.reps);
      set.done = true;
      startRest();
    } else {
      set.done = false;
    }
    saveDraft();
    // Bez animacji: zmiana stanu natychmiast (robione dziesiątki razy na trening).
    row.classList.toggle('is-done', set.done);
    check.setAttribute('aria-pressed', String(set.done));
    check.setAttribute('aria-label', set.done ? `Cofnij zaliczenie serii ${label}` : `Zalicz serię ${label}`);
    refreshPRs(ctx);
    refreshHints();
    ctx.updateStats();
    if (set.done && draftPRs(ctx.draft.exercises).has(set.id)) {
      toast(`Nowy rekord: ${getExercise(we.exerciseId).name}`, { tone: 'success' });
    }
  });

  row.append(labelBtn, kg, reps, rir, check);
  const updatePlaceholders = () => {
    const h2 = getHint();
    kg.placeholder = h2?.weight != null ? fmtNum(h2.weight) : 'kg';
    reps.placeholder = h2?.reps != null ? String(h2.reps) : 'powt.';
    rir.placeholder = h2?.rir != null ? String(h2.rir) : '–';
  };
  const pr = h(
    'div',
    { class: 'set-pr', dataset: { pr: set.id }, hidden: !isPR },
    icon('trophy', 14),
    h('span', null, isPR ? `Rekord · szac. 1RM ${fmtKg(round(e1rm(set.weight, set.reps), 0.1))}` : ''),
  );
  return [row, pr, updatePlaceholders];
}

// ---------- Menu ćwiczenia ----------

function exerciseMenu(ctx: CardCtx, we: WorkoutExercise) {
  const ex = getExercise(we.exerciseId);
  const idx = ctx.draft.exercises.indexOf(we);
  const close = () => sheet.close();
  const item = (label: string, iconName: string, fn: () => void, opts: { danger?: boolean; disabled?: boolean } = {}) =>
    h(
      'button',
      {
        class: `menu-item${opts.danger ? ' is-danger' : ''}`,
        disabled: opts.disabled,
        onclick: () => {
          close();
          fn();
        },
      },
      icon(iconName, 20),
      h('span', null, label),
    );

  const lastWeight = [...we.sets].reverse().find((s) => s.weight !== null)?.weight ?? lastSets(we.exerciseId)?.[0]?.weight ?? null;

  const sheet = openSheet({
    title: ex.name,
    content: h(
      'div',
      { class: 'menu' },
      item('Kalkulator talerzy', 'dumbbell', () => openPlates(lastWeight)),
      item('Usuń ostatnią serię', 'close', () => {
        we.sets.pop();
        saveDraft();
        rerenderCard(ctx, we);
      }, { disabled: we.sets.length === 0 }),
      item('Przesuń wyżej', 'up', () => moveExercise(ctx, idx, -1), { disabled: idx <= 0 }),
      item('Przesuń niżej', 'down', () => moveExercise(ctx, idx, 1), {
        disabled: idx >= ctx.draft.exercises.length - 1,
      }),
      item('Usuń ćwiczenie', 'trash', async () => {
        const doneCount = we.sets.filter((s) => s.done).length;
        if (doneCount) {
          const ok = await confirmSheet({
            title: 'Usunąć ćwiczenie?',
            message: `„${ex.name}” ma ${plural(doneCount, ['zaliczoną serię', 'zaliczone serie', 'zaliczonych serii'])}. Zostaną usunięte z tego treningu.`,
            confirmLabel: 'Usuń ćwiczenie',
            danger: true,
          });
          if (!ok) return;
        }
        ctx.draft.exercises = ctx.draft.exercises.filter((x) => x !== we);
        saveDraft();
        app.rerender();
      }, { danger: true }),
    ),
  });
}

function moveExercise(ctx: CardCtx, idx: number, dir: -1 | 1) {
  const list = ctx.draft.exercises;
  const target = idx + dir;
  if (target < 0 || target >= list.length) return;
  [list[idx], list[target]] = [list[target], list[idx]];
  saveDraft();
  app.rerender();
}

// ---------- Dodawanie ćwiczenia ----------

function addExerciseSheet(ctx: CardCtx) {
  let query = '';
  let muscle: Muscle | null = null;
  const search = h('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Szukaj lub wpisz nową nazwę',
    enterKeyHint: 'search',
    autocomplete: 'off',
    maxlength: String(LIMITS.exerciseName),
    'aria-label': 'Nazwa ćwiczenia',
  });
  const results = h('div', { class: 'menu' });
  const createBox = h('div', { class: 'card create-box', hidden: true });

  const add = (exerciseId: string) => {
    const we: WorkoutExercise = { id: uid(), exerciseId, sets: [emptySet(), emptySet(), emptySet()] };
    ctx.draft.exercises.push(we);
    saveDraft();
    sheet.close();
    const empty = document.querySelector('.main .empty');
    empty?.remove();
    const card = rerenderCard(ctx, we);
    card.scrollIntoView({ block: 'center' });
  };

  const renderResults = () => {
    const q = query.trim().toLocaleLowerCase('pl-PL');
    const all = [...state.exercises.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    const matches = q ? all.filter((e) => e.name.toLocaleLowerCase('pl-PL').includes(q)) : all;
    const used = new Set(ctx.draft.exercises.map((e) => e.exerciseId));
    results.replaceChildren(
      ...matches.slice(0, 60).map((e) =>
        h(
          'button',
          { class: 'menu-item', onclick: () => add(e.id) },
          h('span', { class: 'menu-item-text' }, h('span', null, e.name), h('small', null, e.muscle + (used.has(e.id) ? ' · już w treningu' : ''))),
          icon('plus', 20),
        ),
      ),
    );
    if (!matches.length) results.append(h('p', { class: 'menu-empty' }, q ? 'Brak takiego ćwiczenia.' : 'Katalog jest pusty.'));
    const exact = all.some((e) => e.name.toLocaleLowerCase('pl-PL') === q);
    createBox.hidden = !q || exact;
    if (!createBox.hidden) renderCreate();
  };

  const renderCreate = () => {
    const name = cleanName(query, LIMITS.exerciseName);
    createBox.replaceChildren(
      h('p', { class: 'create-title' }, `Nowe ćwiczenie: „${name}”`),
      h('p', { class: 'field-label' }, 'Partia mięśniowa'),
      h(
        'div',
        { class: 'chips' },
        MUSCLES.map((m) =>
          h(
            'button',
            {
              class: `chip${m === muscle ? ' is-active' : ''}`,
              'aria-pressed': String(m === muscle),
              onclick: () => {
                muscle = m;
                renderCreate();
              },
            },
            m,
          ),
        ),
      ),
      h(
        'button',
        {
          class: 'btn btn-block btn-primary mt-12',
          disabled: !muscle,
          onclick: () => muscle && add(createExercise(name, muscle).id),
        },
        muscle ? 'Utwórz i dodaj' : 'Wybierz partię',
      ),
    );
  };

  search.addEventListener('input', () => {
    query = search.value;
    renderResults();
  });
  renderResults();

  const sheet = openSheet({
    title: 'Dodaj ćwiczenie',
    className: 'sheet-tall',
    content: [search, createBox, results],
  });
}

// ---------- Menu treningu ----------

function workoutMenu(draft: Draft) {
  const rest = h(
    'div',
    { class: 'segmented segmented-3' },
    REST_OPTIONS.map((s) =>
      h(
        'button',
        {
          class: `segment${state.settings.restSeconds === s ? ' is-active' : ''}`,
          'aria-pressed': String(state.settings.restSeconds === s),
          onclick: () => {
            state.settings.restSeconds = s;
            void saveSettings();
            sheet.close();
            toast(`Przerwa: ${fmtClock(s)}`);
          },
        },
        fmtClock(s),
      ),
    ),
  );
  const sheet = openSheet({
    title: 'Trening',
    content: [
      h('p', { class: 'field-label' }, 'Czas przerwy'),
      rest,
      h(
        'div',
        { class: 'menu mt-16' },
        h(
          'button',
          { class: 'menu-item', onclick: () => (sheet.close(), startRest()) },
          icon('timer', 20),
          h('span', null, 'Włącz przerwę teraz'),
        ),
        draft.restEndsAt &&
          h(
            'button',
            { class: 'menu-item', onclick: () => (sheet.close(), addRest(30)) },
            icon('plus', 20),
            h('span', null, 'Przedłuż przerwę o 30 s'),
          ),
        h(
          'button',
          { class: 'menu-item', onclick: () => (sheet.close(), openPlates(null)) },
          icon('dumbbell', 20),
          h('span', null, 'Kalkulator talerzy'),
        ),
        h(
          'button',
          { class: 'menu-item is-danger', onclick: () => (sheet.close(), discardFlow()) },
          icon('trash', 20),
          h('span', null, 'Odrzuć trening'),
        ),
      ),
    ],
  });
}

// ---------- Zakończenie / odrzucenie ----------

async function discardFlow() {
  const draft = state.draft;
  if (!draft) return;
  const t = workoutTotals(draft);
  const ok = await confirmSheet({
    title: 'Odrzucić trening?',
    message: t.sets
      ? `${plural(t.sets, ['zaliczona seria', 'zaliczone serie', 'zaliczonych serii'])} przepadnie. Tego nie da się cofnąć.`
      : 'Trening nie zostanie zapisany w historii.',
    confirmLabel: 'Odrzuć trening',
    cancelLabel: 'Wróć do treningu',
    danger: true,
  });
  if (!ok) return;
  skipRest();
  await discardDraft();
  app.go('trening', { top: true });
  toast('Trening odrzucony.');
}

async function finishFlow(draft: Draft) {
  const t = workoutTotals(draft);
  const doneAny = draft.exercises.some((e) => e.sets.some((s) => s.done));
  if (!doneAny) {
    const discard = await confirmSheet({
      title: 'Brak zaliczonych serii',
      message: 'Zalicz serie przyciskiem ✓, żeby zapisać trening. Możesz też go odrzucić.',
      confirmLabel: 'Odrzuć trening',
      cancelLabel: 'Wróć do treningu',
      danger: true,
    });
    if (discard) {
      skipRest();
      await discardDraft();
      app.go('trening', { top: true });
    }
    return;
  }
  const skipped = draft.exercises.reduce(
    (n, e) => n + e.sets.filter((s) => !s.done && (s.weight !== null || s.reps !== null)).length,
    0,
  );
  const duration = Date.now() - draft.startedAt;
  const prs = draftPRs(draft.exercises).size;
  const totalSets = draft.exercises.reduce((n, e) => n + e.sets.filter((x) => !x.warmup).length, 0);
  const note = draft.note.trim();
  const msg = h(
    'div',
    { class: 'summary' },
    h(
      'div',
      { class: 'stat-grid' },
      stat('Czas trwania', fmtDuration(duration)),
      stat('Ukończone serie', `${fmtNum(t.sets)} / ${fmtNum(Math.max(t.sets, totalSets))}`),
      stat('Objętość', fmtKg(Math.round(t.volume))),
    ),
    prs > 0 &&
      h(
        'p',
        { class: 'sheet-text' },
        `${plural(prs, ['nowy rekord', 'nowe rekordy', 'nowych rekordów'])} w tym treningu.`,
      ),
    note &&
      h(
        'div',
        { class: 'card note-box' },
        h('p', { class: 'sheet-eyebrow' }, 'Notatka do treningu'),
        h('p', null, note),
      ),
    skipped > 0 &&
      h(
        'p',
        { class: 'sheet-text' },
        `${plural(skipped, ['niezaliczona seria zostanie pominięta', 'niezaliczone serie zostaną pominięte', 'niezaliczonych serii zostanie pominiętych'])}.`,
      ),
  );
  const ok = await confirmSheet({
    eyebrow: 'Podsumowanie sesji',
    title: `Trening ${draft.name}`,
    message: msg,
    confirmLabel: 'Zapisz w historii',
    cancelLabel: 'Wróć do wpisywania',
  });
  if (!ok || state.draft !== draft) return;

  const endedAt = Date.now();
  const workout = {
    id: draft.id,
    planId: draft.planId,
    name: draft.name,
    startedAt: draft.startedAt,
    endedAt,
    note: draft.note.trim(),
    exercises: draft.exercises
      .map((e) => ({ id: e.id, exerciseId: e.exerciseId, target: e.target, sets: e.sets.filter((s) => s.done) }))
      .filter((e) => e.sets.length > 0),
  };
  skipRest();
  await finishDraft(workout);
  syncRest();
  app.go('trening', { top: true });
  toast(
    prs
      ? `Zapisano trening. ${plural(prs, ['nowy rekord', 'nowe rekordy', 'nowych rekordów'])}!`
      : 'Zapisano trening.',
    { tone: 'success' },
  );
}

function stat(label: string, value: string) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-value num' }, value), h('span', { class: 'stat-label' }, label));
}
