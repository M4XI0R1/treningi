import { app } from '../app';
import { REST_OPTIONS } from '../defaults';
import { exerciseSetCount } from '../stats';
import {
  ImportError,
  LIMITS,
  cleanName,
  exerciseByName,
  exportFile,
  getExercise,
  importData,
  markExported,
  normalizeName,
  parseImport,
  saveCatalog,
  saveSettings,
  state,
} from '../store';
import { MUSCLES, type AppData, type Muscle, type Plan, type ThemeKey } from '../types';
import { catBadge, planCategory } from '../ui/category';
import { applyTheme } from '../ui/theme';
import { confirmSheet, openSheet } from '../ui/sheet';
import { toast } from '../ui/toast';
import { W, clamp, fmtClock, fmtDate, fmtKg, fmtNum, fmtRelDay, h, icon, parseNum, plural, uid } from '../util';

declare const __BUILD__: string;

const THEMES: { key: ThemeKey; label: string; colors: string[] }[] = [
  { key: 'categories', label: 'Kolorowe kategorie', colors: ['#34C759', '#E05A47', '#4A65D6'] },
  { key: 'warm', label: 'Ciepły alabaster', colors: ['#D98218', '#EAB308'] },
  { key: 'sage', label: 'Szałwia i grafit', colors: ['#238A63', '#1C1C1E'] },
];

export function renderPlan(root: HTMLElement) {
  root.append(
    h(
      'header',
      { class: 'page-header' },
      h('h1', { class: 'page-title' }, 'Plan'),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => openEditor(null) }, icon('plus', 18), 'Nowy'),
    ),
    plansSection(),
    settingsSection(),
    backupSection(),
    aboutSection(),
  );
}

function section(title: string, ...children: (Node | null | false)[]) {
  return h('section', { class: 'section' }, h('h2', { class: 'section-title' }, title), ...children);
}

// =====================================================================
// Treningi w planie
// =====================================================================

function plansSection() {
  return h(
    'section',
    { class: 'section', style: 'margin-top:4px' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { class: 'section-title' }, 'Treningi'),
      state.plans.length > 0 &&
        h('span', { class: 'section-aside num' }, `${plural(state.plans.length, ['dzień', 'dni', 'dni'])} w rotacji`),
    ),
    state.plans.length
      ? h(
          'div',
          { class: 'stack' },
          state.plans.map((p, i) =>
            h(
              'button',
              { class: 'card plan-card', onclick: () => openEditor(p), 'aria-label': `Edytuj trening ${p.name}` },
              h(
                'div',
                { class: 'plan-card-top' },
                catBadge(planCategory(p), 'sm'),
                h('span', { class: 'plan-card-name' }, `${i + 1}. ${p.name || 'Bez nazwy'}`),
                h('span', { class: 'pill-btn' }, 'Edytuj'),
              ),
              p.exercises.length
                ? h(
                    'ul',
                    { class: 'plan-rows' },
                    p.exercises.map((pe) =>
                      h(
                        'li',
                        null,
                        h('span', { class: 'plan-row-name-text' }, getExercise(pe.exerciseId).name),
                        h(
                          'span',
                          { class: 'plan-row-target' },
                          `${pe.sets} × ${pe.repsMin === pe.repsMax ? pe.repsMin : `${pe.repsMin}–${pe.repsMax}`}`,
                        ),
                      ),
                    ),
                  )
                : h('p', { class: 'plan-row-meta' }, 'Brak ćwiczeń'),
            ),
          ),
        )
      : h(
          'div',
          { class: 'card empty-card' },
          h('p', { class: 'empty-title' }, 'Plan jest pusty'),
          h('p', { class: 'empty-text' }, 'Dodaj pierwszy trening przyciskiem „Nowy”.'),
        ),
    h('p', { class: 'footnote' }, 'Kolejność ustala rotację: „Następny” to trening po ostatnio wykonanym.'),
  );
}

interface RowDraft {
  key: string;
  exerciseId: string | null;
  origName: string;
  name: string;
  muscle: Muscle;
  sets: string;
  repsMin: string;
  repsMax: string;
}

function openEditor(plan: Plan | null) {
  const isNew = !plan;
  let name = plan?.name ?? '';
  const rows: RowDraft[] = (plan?.exercises ?? []).map((pe) => {
    const ex = getExercise(pe.exerciseId);
    return {
      key: pe.id,
      exerciseId: pe.exerciseId,
      origName: ex.name,
      name: ex.name,
      muscle: ex.muscle,
      sets: String(pe.sets),
      repsMin: String(pe.repsMin),
      repsMax: String(pe.repsMax),
    };
  });
  const initial = JSON.stringify({ name, rows });
  const dirty = () => JSON.stringify({ name, rows }) !== initial;
  let showErrors = false;

  const datalist = h(
    'datalist',
    { id: 'exercise-names' },
    [...state.exercises.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
      .map((e) => h('option', { value: e.name })),
  );

  const nameInput = h('input', {
    class: 'input input-lg',
    type: 'text',
    value: name,
    placeholder: 'np. Push',
    maxlength: String(LIMITS.planName),
    autocomplete: 'off',
    enterKeyHint: 'done',
    'aria-label': 'Nazwa treningu',
    oninput: (e: Event) => {
      name = (e.target as HTMLInputElement).value;
      nameErr.hidden = !(showErrors && !name.trim());
    },
  });
  const nameErr = h('p', { class: 'field-error', hidden: true }, 'Wpisz nazwę treningu.');
  const rowsBox = h('div', { class: 'stack' });

  const renderRows = () => {
    rowsBox.replaceChildren(
      ...rows.map((row, i) => rowEditor(row, i)),
      rows.length === 0 ? h('p', { class: 'menu-empty' }, 'Brak ćwiczeń. Dodaj pierwsze poniżej.') : h('span'),
    );
  };

  const rowHint = (row: RowDraft): { text: string; tone: 'info' | 'warn' | 'error' } | null => {
    const clean = cleanName(row.name, LIMITS.exerciseName);
    if (!clean) return showErrors ? { text: 'Wpisz nazwę ćwiczenia.', tone: 'error' } : null;
    const match = exerciseByName(clean);
    if (row.exerciseId && normalizeName(clean) !== normalizeName(row.origName)) {
      if (match && match.id !== row.exerciseId) {
        return { text: `Podepnie istniejące ćwiczenie „${match.name}” razem z jego historią.`, tone: 'info' };
      }
      const count = exerciseSetCount(row.exerciseId);
      if (count > 0) {
        return {
          text: `Ma historię (${plural(count, W.set)}). Nazwa zmieni się też w historii, na wykresach i w innych treningach; dane zostają. Jeśli to inne ćwiczenie, usuń wiersz i dodaj nowy.`,
          tone: 'warn',
        };
      }
    }
    if (!row.exerciseId && match) return { text: 'Istniejące ćwiczenie: historia zostanie podpięta.', tone: 'info' };
    return null;
  };

  const rowEditor = (row: RowDraft, i: number) => {
    const hintEl = h('p', { class: 'field-hint', hidden: true });
    const updateHint = () => {
      const hint = rowHint(row);
      hintEl.hidden = !hint;
      if (hint) {
        hintEl.textContent = hint.text;
        hintEl.className = `field-hint is-${hint.tone}`;
      }
    };
    updateHint();
    const num = (key: 'sets' | 'repsMin' | 'repsMax', aria: string) =>
      h('input', {
        class: 'input input-num num',
        type: 'text',
        inputMode: 'numeric',
        pattern: '[0-9]*',
        maxlength: '3',
        value: row[key],
        'aria-label': aria,
        oninput: (e: Event) => (row[key] = (e.target as HTMLInputElement).value),
      });
    const muscleSelect = h(
      'select',
      {
        class: 'input select',
        'aria-label': 'Partia mięśniowa',
        onchange: (e: Event) => (row.muscle = (e.target as HTMLSelectElement).value as Muscle),
      },
      MUSCLES.map((m) => {
        const o = h('option', { value: m }, m);
        o.selected = m === row.muscle;
        return o;
      }),
    );
    const move = (dir: -1 | 1) => {
      const t = i + dir;
      if (t < 0 || t >= rows.length) return;
      [rows[i], rows[t]] = [rows[t], rows[i]];
      renderRows();
    };
    return h(
      'div',
      { class: 'card edit-row' },
      h(
        'div',
        { class: 'edit-row-top' },
        h('input', {
          class: 'input',
          type: 'text',
          value: row.name,
          placeholder: 'Nazwa ćwiczenia',
          list: 'exercise-names',
          maxlength: String(LIMITS.exerciseName),
          autocomplete: 'off',
          'aria-label': `Nazwa ćwiczenia ${i + 1}`,
          oninput: (e: Event) => {
            row.name = (e.target as HTMLInputElement).value;
            const match = exerciseByName(row.name);
            if (match && !row.exerciseId) {
              row.muscle = match.muscle;
              muscleSelect.value = match.muscle;
            }
            updateHint();
          },
        }),
      ),
      hintEl,
      h(
        'div',
        { class: 'edit-row-grid' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Partia'), muscleSelect),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Serie'), num('sets', 'Liczba serii')),
        h(
          'div',
          { class: 'field' },
          h('span', { class: 'field-label' }, 'Powtórzenia'),
          h('div', { class: 'range' }, num('repsMin', 'Powtórzenia od'), h('span', null, '–'), num('repsMax', 'Powtórzenia do')),
        ),
      ),
      h(
        'div',
        { class: 'edit-row-actions' },
        h('button', { class: 'icon-btn', 'aria-label': 'Przesuń wyżej', disabled: i === 0, onclick: () => move(-1) }, icon('up', 20)),
        h('button', { class: 'icon-btn', 'aria-label': 'Przesuń niżej', disabled: i === rows.length - 1, onclick: () => move(1) }, icon('down', 20)),
        h(
          'button',
          {
            class: 'icon-btn is-danger',
            'aria-label': 'Usuń ćwiczenie z treningu',
            onclick: () => {
              rows.splice(i, 1);
              renderRows();
            },
          },
          icon('trash', 20),
        ),
      ),
    );
  };

  const save = () => {
    showErrors = true;
    const planName = cleanName(name, LIMITS.planName);
    const bad = !planName || rows.some((r) => !cleanName(r.name, LIMITS.exerciseName));
    nameErr.hidden = !!planName;
    if (bad) {
      renderRows();
      // Błędy są przy polach; przewiń do pierwszego zamiast zasłaniać formularz toastem.
      const first = !planName ? nameInput : rowsBox.querySelector('.field-hint.is-error');
      first?.scrollIntoView({ block: 'center' });
      return;
    }
    let renamed = 0;
    const exercises = rows.map((row) => {
      const clean = cleanName(row.name, LIMITS.exerciseName);
      let exerciseId: string;
      const match = exerciseByName(clean);
      if (row.exerciseId && normalizeName(clean) === normalizeName(row.origName)) {
        exerciseId = row.exerciseId;
        const ex = state.exercises.get(exerciseId);
        if (ex) ex.name = clean; // zmiana wielkości liter / spacji
      } else if (match) {
        exerciseId = match.id;
      } else if (row.exerciseId && state.exercises.has(row.exerciseId)) {
        exerciseId = row.exerciseId;
        state.exercises.get(exerciseId)!.name = clean;
        renamed++;
      } else {
        exerciseId = uid();
        state.exercises.set(exerciseId, { id: exerciseId, name: clean, muscle: row.muscle });
      }
      const ex = state.exercises.get(exerciseId);
      if (ex) ex.muscle = row.muscle;
      let lo = clamp(Math.round(parseNum(row.repsMin) ?? 8), 1, LIMITS.reps);
      let hi = clamp(Math.round(parseNum(row.repsMax) ?? lo), 1, LIMITS.reps);
      if (lo > hi) [lo, hi] = [hi, lo];
      return {
        id: row.key,
        exerciseId,
        sets: clamp(Math.round(parseNum(row.sets) ?? 3), 1, LIMITS.sets),
        repsMin: lo,
        repsMax: hi,
      };
    });
    if (plan) {
      plan.name = planName;
      plan.exercises = exercises;
    } else {
      state.plans.push({ id: uid(), name: planName, exercises });
    }
    void saveCatalog();
    sheet.close();
    app.rerender();
    toast(renamed ? 'Zapisano. Nowe nazwy są też w historii.' : 'Zapisano plan.', { tone: 'success' });
  };

  const cancel = async () => {
    if (dirty()) {
      const ok = await confirmSheet({
        title: 'Odrzucić zmiany?',
        message: 'Zmiany w tym treningu nie zostaną zapisane.',
        confirmLabel: 'Odrzuć zmiany',
        cancelLabel: 'Edytuj dalej',
        danger: true,
      });
      if (!ok) return;
    }
    sheet.close();
  };

  const header = h(
    'div',
    { class: 'sheet-header sheet-header-bar' },
    h('button', { class: 'btn btn-text', onclick: cancel }, 'Anuluj'),
    h('h2', { class: 'sheet-title' }, isNew ? 'Nowy trening' : 'Edycja'),
    h('button', { class: 'btn btn-text btn-text-accent', onclick: save }, 'Zapisz'),
  );

  const idx = plan ? state.plans.indexOf(plan) : -1;
  const reorder = (dir: -1 | 1) => {
    const t = idx + dir;
    if (!plan || t < 0 || t >= state.plans.length) return;
    [state.plans[idx], state.plans[t]] = [state.plans[t], state.plans[idx]];
    void saveCatalog();
    sheet.close();
    app.rerender();
  };

  renderRows();
  const sheet = openSheet({
    title: isNew ? 'Nowy trening' : 'Edycja treningu',
    header,
    className: 'sheet-tall',
    guarded: dirty,
    content: [
      datalist,
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nazwa'), nameInput, nameErr),
      h('h3', { class: 'sub-title' }, 'Ćwiczenia'),
      rowsBox,
      h(
        'button',
        {
          class: 'btn btn-block btn-secondary mt-12',
          onclick: () => {
            rows.push({
              key: uid(),
              exerciseId: null,
              origName: '',
              name: '',
              muscle: 'Klatka',
              sets: '3',
              repsMin: '8',
              repsMax: '12',
            });
            renderRows();
            const inputs = rowsBox.querySelectorAll<HTMLInputElement>('.edit-row-top input');
            inputs[inputs.length - 1]?.focus();
          },
        },
        icon('plus', 20),
        'Dodaj ćwiczenie',
      ),
      plan &&
        h(
          'div',
          { class: 'menu mt-16' },
          h('button', { class: 'menu-item', disabled: idx <= 0, onclick: () => reorder(-1) }, icon('up', 20), h('span', null, 'Wcześniej w rotacji')),
          h(
            'button',
            { class: 'menu-item', disabled: idx >= state.plans.length - 1, onclick: () => reorder(1) },
            icon('down', 20),
            h('span', null, 'Później w rotacji'),
          ),
          h(
            'button',
            {
              class: 'menu-item is-danger',
              onclick: async () => {
                const ok = await confirmSheet({
                  title: `Usunąć „${plan.name}”?`,
                  message: 'Trening zniknie z planu. Historia i wykresy zostają.',
                  confirmLabel: 'Usuń trening',
                  danger: true,
                });
                if (!ok) return;
                state.plans = state.plans.filter((p) => p !== plan);
                void saveCatalog();
                sheet.close();
                app.rerender();
              },
            },
            icon('trash', 20),
            h('span', null, 'Usuń trening z planu'),
          ),
        ),
    ],
  });
}

// =====================================================================
// Ustawienia
// =====================================================================

function settingsSection() {
  const s = state.settings;
  const bar = h('input', {
    class: 'input num',
    type: 'text',
    inputMode: 'decimal',
    maxlength: '5',
    value: fmtNum(s.barKg),
    'aria-label': 'Waga gryfu w kg',
    onchange: (e: Event) => {
      const input = e.target as HTMLInputElement;
      const n = parseNum(input.value);
      if (n === null || n < 0 || n > 100) {
        input.value = fmtNum(s.barKg);
        toast('Gryf: od 0 do 100 kg.');
        return;
      }
      s.barKg = n;
      input.value = fmtNum(n);
      void saveSettings();
    },
  });
  const plates = h('input', {
    class: 'input num',
    type: 'text',
    inputMode: 'text',
    autocomplete: 'off',
    value: s.plates.map((p) => fmtNum(p)).join('; '),
    'aria-label': 'Dostępne talerze w kg',
    onchange: (e: Event) => {
      const input = e.target as HTMLInputElement;
      const list = input.value
        .split(/[;\s]+/)
        .map((x) => parseNum(x))
        .filter((x): x is number => x !== null && x > 0 && x <= 100);
      if (!list.length) {
        input.value = s.plates.map((p) => fmtNum(p)).join('; ');
        toast('Podaj co najmniej jeden talerz.');
        return;
      }
      s.plates = [...new Set(list)].sort((a, b) => b - a);
      input.value = s.plates.map((p) => fmtNum(p)).join('; ');
      void saveSettings();
    },
  });

  return section(
    'Ustawienia',
    h(
      'div',
      { class: 'card' },
      h('p', { class: 'field-label' }, 'Wygląd'),
      h(
        'div',
        { class: 'theme-options' },
        THEMES.map((t) =>
          h(
            'button',
            {
              class: `theme-option${(s.theme ?? 'categories') === t.key ? ' is-active' : ''}`,
              'aria-pressed': String((s.theme ?? 'categories') === t.key),
              onclick: () => {
                s.theme = t.key;
                applyTheme();
                void saveSettings();
                app.rerender();
              },
            },
            h('span', { class: 'theme-swatches', 'aria-hidden': 'true' }, t.colors.map((c) => h('span', { style: `background:${c}` }))),
            t.label,
          ),
        ),
      ),
      h('p', { class: 'field-label mt-16' }, 'Cel: treningi w tygodniu'),
      h(
        'div',
        { class: 'segmented' },
        [2, 3, 4, 5, 6].map((n) =>
          h(
            'button',
            {
              class: `segment num${(s.weeklyGoal ?? 4) === n ? ' is-active' : ''}`,
              'aria-pressed': String((s.weeklyGoal ?? 4) === n),
              onclick: () => {
                s.weeklyGoal = n;
                void saveSettings();
                app.rerender();
              },
            },
            String(n),
          ),
        ),
      ),
      h('p', { class: 'field-label mt-16' }, 'Czas przerwy'),
      h(
        'div',
        { class: 'segmented segmented-3' },
        REST_OPTIONS.map((sec) =>
          h(
            'button',
            {
              class: `segment num${s.restSeconds === sec ? ' is-active' : ''}`,
              'aria-pressed': String(s.restSeconds === sec),
              onclick: () => {
                s.restSeconds = sec;
                void saveSettings();
                app.rerender();
              },
            },
            fmtClock(sec),
          ),
        ),
      ),
      h(
        'div',
        { class: 'grid-2 mt-16' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Gryf (kg)'), bar),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Talerze (kg)'), plates),
      ),
      h('p', { class: 'footnote' }, `Talerze rozdziel średnikiem. Przykład dla 100 kg: gryf ${fmtKg(s.barKg)} + talerze na stronę.`),
    ),
  );
}

// =====================================================================
// Kopia zapasowa
// =====================================================================

function backupSection() {
  const last = state.settings.lastExportAt;
  const stale = !last || Date.now() - last > 14 * 86_400_000;
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'visually-hidden',
    tabindex: '-1',
    onchange: async (e: Event) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (file) await runImport(await file.text());
    },
  });

  return section(
    'Kopia zapasowa',
    h(
      'div',
      { class: 'card' },
      h(
        'p',
        { class: `backup-status${stale && state.workouts.length ? ' is-stale' : ''}` },
        last ? `Ostatni eksport: ${fmtRelDay(last)} (${fmtDate(last)})` : 'Nie zrobiono jeszcze eksportu.',
      ),
      stale &&
        state.workouts.length > 0 &&
        h('p', { class: 'footnote' }, 'Minęło ponad 14 dni. Zapisz kopię w Plikach lub wyślij ją sobie.'),
      h(
        'div',
        { class: 'grid-2 mt-12' },
        h('button', { class: 'btn btn-secondary', onclick: copyJson }, 'Kopiuj JSON'),
        h('button', { class: 'btn btn-secondary', onclick: saveFile }, 'Zapisz plik'),
        h('button', { class: 'btn btn-secondary', onclick: () => fileInput.click() }, 'Import z pliku'),
        h('button', { class: 'btn btn-secondary', onclick: pasteImport }, 'Wklej JSON'),
      ),
      fileInput,
      h('p', { class: 'footnote' }, 'Import zastępuje wszystkie dane na tym telefonie.'),
    ),
  );
}

function backupJson() {
  return JSON.stringify(exportFile(), null, 1);
}

function fileName() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `moj-trening-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

async function copyJson() {
  const json = backupJson();
  try {
    await navigator.clipboard.writeText(json);
    markExported();
    app.rerender();
    toast('Skopiowano kopię do schowka.', { tone: 'success' });
  } catch {
    // Zapas: pole z zaznaczonym tekstem do ręcznego skopiowania.
    const area = h('textarea', { class: 'input textarea code', readonly: true, rows: 8, value: json });
    openSheet({
      title: 'Skopiuj ręcznie',
      content: [h('p', { class: 'sheet-text' }, 'Zaznacz całość i skopiuj.'), area],
    });
    area.focus();
    area.select();
    markExported();
  }
}

async function saveFile() {
  const json = backupJson();
  const name = fileName();
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      markExported();
      app.rerender();
      return;
    }
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  markExported();
  app.rerender();
  toast('Zapisano plik kopii.', { tone: 'success' });
}

function pasteImport() {
  const area = h('textarea', {
    class: 'input textarea code',
    rows: 8,
    placeholder: 'Wklej tu zawartość pliku JSON',
    autocomplete: 'off',
    spellcheck: false,
    autocapitalize: 'off',
  });
  const sheet = openSheet({
    title: 'Wklej JSON',
    className: 'sheet-tall',
    content: [
      area,
      h(
        'button',
        {
          class: 'btn btn-block btn-primary mt-12',
          onclick: async () => {
            if (!area.value.trim()) return toast('Pole jest puste.');
            await sheet.close();
            await runImport(area.value);
          },
        },
        'Sprawdź i importuj',
      ),
    ],
  });
}

async function runImport(text: string) {
  let data: AppData;
  try {
    data = parseImport(text);
  } catch (err) {
    toast(err instanceof ImportError ? err.message : 'Nie udało się odczytać kopii.', { tone: 'error', duration: 5000 });
    return;
  }
  const ok = await confirmSheet({
    title: 'Zastąpić dane?',
    message: h(
      'div',
      null,
      h(
        'p',
        { class: 'sheet-text' },
        `Kopia zawiera: ${plural(data.workouts.length, W.workout)}, ${plural(data.plans.length, ['trening w planie', 'treningi w planie', 'treningów w planie'])}, ${plural(data.bodyweight.length, W.entry)} wagi.`,
      ),
      h(
        'p',
        { class: 'sheet-text' },
        `Obecne dane (${plural(state.workouts.length, W.workout)}) zostaną usunięte.${state.draft ? ' Trwający trening też.' : ''}`,
      ),
    ),
    confirmLabel: 'Zastąp dane',
    danger: true,
  });
  if (!ok) return;
  try {
    await importData(data);
    app.go('plan');
    toast('Zaimportowano dane.', { tone: 'success' });
  } catch (err) {
    console.error(err);
    toast('Import nie powiódł się. Dane nie zostały zmienione.', { tone: 'error' });
  }
}

// =====================================================================

function aboutSection() {
  return section(
    'O aplikacji',
    h(
      'div',
      { class: 'card about' },
      h('p', null, `Wersja: ${__BUILD__}`),
      h(
        'p',
        null,
        `Pamięć trwała: ${state.persisted === true ? 'tak' : state.persisted === false ? 'nie (iOS może ją przyznać później)' : 'nieznana'}`,
      ),
      h('p', null, `Dane: ${plural(state.workouts.length, W.workout)}, ${plural(state.exercises.size, W.exercise)} w katalogu.`),
      h('p', { class: 'footnote' }, 'Wszystko zostaje na tym telefonie. Aplikacja nie wysyła niczego do internetu.'),
    ),
  );
}
