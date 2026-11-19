import * as db from './db';
import { DEFAULT_SETTINGS, defaultPlans } from './defaults';
import {
  MUSCLES,
  type AppData,
  type BodyWeight,
  type Draft,
  type Exercise,
  type ExportFile,
  type Muscle,
  type Plan,
  type Settings,
  type Workout,
} from './types';
import { debounce, uid } from './util';

/** Wersja schematu danych (kształtu rekordów). Podbij i dopisz migrację przy zmianie. */
export const SCHEMA = 1;

/** Migracje danych: indeks = wersja, z której się przechodzi (1 → 2 to DATA_MIGRATIONS[1]). */
const DATA_MIGRATIONS: Record<number, (data: AppData) => AppData> = {
  // 1: (data) => ({ ...data, ... }),
};

export const LIMITS = {
  exerciseName: 120,
  planName: 40,
  note: 2000,
  weight: 1000,
  reps: 100,
  rir: 10,
  sets: 20,
  bodyweight: 400,
};

export const state = {
  exercises: new Map<string, Exercise>(),
  plans: [] as Plan[],
  settings: { ...DEFAULT_SETTINGS } as Settings,
  /** Od najnowszego. */
  workouts: [] as Workout[],
  /** Od najstarszego. */
  bodyweight: [] as BodyWeight[],
  draft: null as Draft | null,
  persisted: null as boolean | null,
};

/** Rośnie przy każdej zmianie historii; używane do zapamiętywania obliczeń. */
let historyRev = 0;
export const historyVersion = () => historyRev;

export const events = new EventTarget();
function reportError(err: unknown) {
  console.error(err);
  events.dispatchEvent(new CustomEvent('error', { detail: err }));
}

// ---------- Wczytanie ----------

export async function load(): Promise<void> {
  const schema = await db.kvGet<number>('schema');
  if (schema === undefined) {
    const { exercises, plans } = defaultPlans();
    state.exercises = new Map(exercises.map((e) => [e.id, e]));
    state.plans = plans;
    state.settings = { ...DEFAULT_SETTINGS };
    await Promise.all([
      db.kvSet('exercises', exercises),
      db.kvSet('plans', plans),
      db.kvSet('settings', state.settings),
      db.kvSet('schema', SCHEMA),
    ]);
    return;
  }

  const [exercises, plans, settings, draft, workouts, bodyweight] = await Promise.all([
    db.kvGet<Exercise[]>('exercises'),
    db.kvGet<Plan[]>('plans'),
    db.kvGet<Settings>('settings'),
    db.kvGet<Draft>('draft'),
    db.getAll<Workout>('workouts'),
    db.getAll<BodyWeight>('bodyweight'),
  ]);
  let data: AppData = {
    exercises: exercises ?? [],
    plans: plans ?? [],
    settings: { ...DEFAULT_SETTINGS, ...settings },
    workouts,
    bodyweight,
  };
  if (schema < SCHEMA) {
    data = migrate(data, schema);
    await writeAll(data);
  }
  applyData(data);
  state.draft = draft ?? null;
  state.persisted = (await navigator.storage?.persisted?.()) ?? null;
}

function migrate(data: AppData, from: number): AppData {
  let out = data;
  for (let v = from; v < SCHEMA; v++) {
    const step = DATA_MIGRATIONS[v];
    if (step) out = step(out);
  }
  return out;
}

function applyData(data: AppData) {
  state.exercises = new Map(data.exercises.map((e) => [e.id, e]));
  state.plans = data.plans;
  state.settings = data.settings;
  state.workouts = [...data.workouts].sort((a, b) => b.startedAt - a.startedAt);
  state.bodyweight = [...data.bodyweight].sort((a, b) => a.date - b.date);
  historyRev++;
}

function writeAll(data: AppData) {
  return db.replaceAll(
    { exercises: data.exercises, plans: data.plans, settings: data.settings, schema: SCHEMA },
    data.workouts,
    data.bodyweight,
  );
}

// ---------- Zapis ----------

let persistAsked = false;
/** Po pierwszym udanym zapisie prosi przeglądarkę o pamięć trwałą (nie do wyczyszczenia automatycznie). */
async function afterWrite() {
  if (persistAsked) return;
  persistAsked = true;
  try {
    if (navigator.storage?.persist) state.persisted = await navigator.storage.persist();
  } catch {
    /* brak wsparcia */
  }
}

async function guard(p: Promise<unknown>) {
  try {
    await p;
    void afterWrite();
  } catch (err) {
    reportError(err);
  }
}

export function getExercise(id: string): Exercise {
  return state.exercises.get(id) ?? { id, name: 'Nieznane ćwiczenie', muscle: 'Klatka' };
}

export function exerciseByName(name: string): Exercise | undefined {
  const key = normalizeName(name);
  for (const e of state.exercises.values()) if (normalizeName(e.name) === key) return e;
  return undefined;
}

export function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl-PL');
}

export function cleanName(name: string, max: number) {
  return name.trim().replace(/\s+/g, ' ').slice(0, max);
}

export function createExercise(name: string, muscle: Muscle): Exercise {
  const existing = exerciseByName(name);
  if (existing) return existing;
  const ex: Exercise = { id: uid(), name: cleanName(name, LIMITS.exerciseName), muscle };
  state.exercises.set(ex.id, ex);
  void saveCatalog();
  return ex;
}

export function saveCatalog() {
  return guard(
    Promise.all([db.kvSet('exercises', [...state.exercises.values()]), db.kvSet('plans', state.plans)]),
  );
}

export function saveSettings() {
  return guard(db.kvSet('settings', state.settings));
}

const writeDraft = debounce(() => {
  void guard(state.draft ? db.kvSet('draft', state.draft) : db.kvDelete('draft'));
}, 250);
/** Szkic zapisuje się z opóźnieniem 250 ms; `flushDraft` wymusza zapis od razu. */
export const saveDraft = () => writeDraft();
export const flushDraft = () => writeDraft.flush();

export async function finishDraft(workout: Workout) {
  state.workouts = [workout, ...state.workouts].sort((a, b) => b.startedAt - a.startedAt);
  state.draft = null;
  historyRev++;
  await guard(Promise.all([db.put('workouts', workout), db.kvDelete('draft')]));
}

export async function discardDraft() {
  state.draft = null;
  await guard(db.kvDelete('draft'));
}

export async function deleteWorkout(id: string) {
  state.workouts = state.workouts.filter((w) => w.id !== id);
  historyRev++;
  await guard(db.remove('workouts', id));
}

export async function addBodyweight(kg: number) {
  const entry: BodyWeight = { id: uid(), date: Date.now(), kg };
  state.bodyweight = [...state.bodyweight, entry];
  await guard(db.put('bodyweight', entry));
}

export async function undoBodyweight() {
  const last = state.bodyweight[state.bodyweight.length - 1];
  if (!last) return;
  state.bodyweight = state.bodyweight.slice(0, -1);
  await guard(db.remove('bodyweight', last.id));
}

// ---------- Eksport / import ----------

export function exportFile(): ExportFile {
  return {
    app: 'moj-trening',
    schema: SCHEMA,
    exportedAt: Date.now(),
    data: {
      exercises: [...state.exercises.values()],
      plans: state.plans,
      settings: state.settings,
      workouts: [...state.workouts].sort((a, b) => a.startedAt - b.startedAt),
      bodyweight: state.bodyweight,
    },
  };
}

export function markExported() {
  state.settings.lastExportAt = Date.now();
  void saveSettings();
}

export class ImportError extends Error {}

/** Waliduje i normalizuje plik kopii. Rzuca ImportError z opisem po polsku. */
export function parseImport(text: string): AppData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('To nie jest poprawny JSON.');
  }
  const file = raw as Partial<ExportFile>;
  if (!isObj(file) || file.app !== 'moj-trening' || !isObj(file.data)) {
    throw new ImportError('To nie jest kopia z aplikacji „Mój trening”.');
  }
  const schema = Number(file.schema);
  if (!Number.isInteger(schema) || schema < 1) throw new ImportError('Brak lub zła wersja schematu.');
  if (schema > SCHEMA) {
    throw new ImportError('Kopia pochodzi z nowszej wersji aplikacji. Najpierw zaktualizuj aplikację.');
  }
  const d = file.data as Record<string, unknown>;
  const fail = (what: string) => {
    throw new ImportError(`Uszkodzone dane: ${what}.`);
  };

  if (!Array.isArray(d.exercises)) fail('brak listy ćwiczeń');
  const exercises: Exercise[] = (d.exercises as unknown[]).map((e, i) => {
    if (!isObj(e) || !isStr(e.id) || !isStr(e.name) || !e.name.trim()) fail(`ćwiczenie #${i + 1}`);
    const ex = e as Exercise;
    const muscle = (MUSCLES as readonly string[]).includes(ex.muscle) ? ex.muscle : fail(`partia ćwiczenia „${ex.name}”`)!;
    return { id: ex.id, name: cleanName(ex.name, LIMITS.exerciseName), muscle };
  });
  const ids = new Set(exercises.map((e) => e.id));
  const exRef = (id: unknown, where: string) => (isStr(id) && ids.has(id) ? id : fail(`nieznane ćwiczenie w: ${where}`)!);

  if (!Array.isArray(d.plans)) fail('brak listy planów');
  const plans: Plan[] = (d.plans as unknown[]).map((p, i) => {
    if (!isObj(p) || !isStr(p.id) || !isStr(p.name) || !Array.isArray(p.exercises)) fail(`plan #${i + 1}`);
    const plan = p as Plan;
    return {
      id: plan.id,
      name: cleanName(plan.name, LIMITS.planName) || 'Trening',
      exercises: plan.exercises.map((pe) => {
        if (!isObj(pe) || !isStr(pe.id)) fail(`ćwiczenie w planie „${plan.name}”`);
        return {
          id: pe.id,
          exerciseId: exRef(pe.exerciseId, `plan „${plan.name}”`),
          sets: int(pe.sets, 1, LIMITS.sets, 3),
          repsMin: int(pe.repsMin, 1, LIMITS.reps, 8),
          repsMax: int(pe.repsMax, 1, LIMITS.reps, 12),
        };
      }),
    };
  });

  if (!Array.isArray(d.workouts)) fail('brak historii treningów');
  const workouts: Workout[] = (d.workouts as unknown[]).map((w, i) => {
    if (!isObj(w) || !isStr(w.id) || !isNum(w.startedAt) || !isNum(w.endedAt) || !Array.isArray(w.exercises)) {
      fail(`trening #${i + 1}`);
    }
    const wo = w as Workout;
    return {
      id: wo.id,
      planId: isStr(wo.planId) ? wo.planId : null,
      name: isStr(wo.name) ? cleanName(wo.name, LIMITS.planName) || 'Trening' : 'Trening',
      startedAt: wo.startedAt,
      endedAt: Math.max(wo.startedAt, wo.endedAt),
      note: isStr(wo.note) ? wo.note.slice(0, LIMITS.note) : '',
      exercises: wo.exercises.map((we) => {
        if (!isObj(we) || !isStr(we.id) || !Array.isArray(we.sets)) fail(`ćwiczenie w treningu #${i + 1}`);
        return {
          id: we.id,
          exerciseId: exRef(we.exerciseId, `trening z ${new Date(wo.startedAt).toLocaleDateString('pl-PL')}`),
          target: isStr(we.target) ? we.target : undefined,
          sets: we.sets.map((s) => {
            if (!isObj(s) || !isStr(s.id)) fail(`seria w treningu #${i + 1}`);
            return {
              id: s.id,
              weight: optNum(s.weight, 0, LIMITS.weight),
              reps: optNum(s.reps, 0, LIMITS.reps),
              rir: optNum(s.rir, 0, LIMITS.rir),
              done: s.done !== false,
              warmup: s.warmup === true,
            };
          }),
        };
      }),
    };
  });

  const bodyweight: BodyWeight[] = Array.isArray(d.bodyweight)
    ? (d.bodyweight as unknown[]).map((b, i) => {
        if (!isObj(b) || !isStr(b.id) || !isNum(b.date) || !isNum(b.kg) || b.kg <= 0) fail(`pomiar wagi #${i + 1}`);
        return { id: (b as BodyWeight).id, date: (b as BodyWeight).date, kg: (b as BodyWeight).kg };
      })
    : [];

  const s = isObj(d.settings) ? (d.settings as Partial<Settings>) : {};
  const settings: Settings = {
    restSeconds: int(s.restSeconds, 15, 900, DEFAULT_SETTINGS.restSeconds),
    barKg: isNum(s.barKg) && s.barKg >= 0 && s.barKg <= 100 ? s.barKg : DEFAULT_SETTINGS.barKg,
    plates:
      Array.isArray(s.plates) && s.plates.every((p) => isNum(p) && p > 0 && p <= 100)
        ? [...s.plates].sort((a, b) => b - a)
        : [...DEFAULT_SETTINGS.plates],
    lastExportAt: isNum(s.lastExportAt) ? s.lastExportAt : null,
    theme: s.theme === 'warm' || s.theme === 'sage' ? s.theme : 'categories',
    weeklyGoal: int(s.weeklyGoal, 1, 7, DEFAULT_SETTINGS.weeklyGoal!),
  };

  return migrate({ exercises, plans, settings, workouts, bodyweight }, schema);
}

/** Zastępuje wszystkie dane zaimportowanymi. Trwający trening zostaje odrzucony. */
export async function importData(data: AppData) {
  await writeAll(data);
  applyData(data);
  state.draft = null;
  void afterWrite();
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
  return typeof v === 'string';
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function int(v: unknown, min: number, max: number, fallback: number) {
  return isNum(v) && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}
function optNum(v: unknown, min: number, max: number) {
  return isNum(v) && v >= min && v <= max ? v : null;
}
