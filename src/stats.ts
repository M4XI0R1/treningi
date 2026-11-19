import { getExercise, historyVersion, state } from './store';
import { MUSCLES, type Muscle, type SetEntry, type Workout, type WorkoutExercise } from './types';
import { startOfWeek } from './util';

/** Szacowany 1RM wg Epleya. Powtórzenia powyżej 12 liczone jak 12. */
export function e1rm(weight: number | null, reps: number | null): number {
  if (!weight || !reps || weight <= 0 || reps <= 0) return 0;
  return weight * (1 + Math.min(reps, 12) / 30);
}

/** Seria robocza: zaliczona, nie rozgrzewkowa, z powtórzeniami. */
export function isWorking(s: SetEntry): boolean {
  return s.done && !s.warmup && (s.reps ?? 0) > 0;
}

export function setVolume(s: SetEntry): number {
  return isWorking(s) ? (s.weight ?? 0) * (s.reps ?? 0) : 0;
}

export function workoutTotals(w: Pick<Workout, 'exercises'>) {
  let sets = 0;
  let volume = 0;
  for (const ex of w.exercises) {
    for (const s of ex.sets) {
      if (!isWorking(s)) continue;
      sets++;
      volume += setVolume(s);
    }
  }
  return { sets, volume };
}

// ---------- Rekordy ----------

let prCache: { rev: number; prs: Set<string>; best: Map<string, number> } | null = null;

/**
 * Rekordy w historii: seria jest rekordem, gdy jej szacowany 1RM przebija wszystko
 * z wcześniejszych treningów i wcześniejszych serii tego samego treningu.
 * Pierwszy w ogóle trening z danym ćwiczeniem nie daje rekordu (nie ma z czym porównać).
 */
function prIndex() {
  if (prCache && prCache.rev === historyVersion()) return prCache;
  const prs = new Set<string>();
  const best = new Map<string, number>();
  const asc = [...state.workouts].sort((a, b) => a.startedAt - b.startedAt);
  for (const w of asc) {
    const sessionBest = new Map<string, number>();
    for (const ex of w.exercises) {
      const before = best.get(ex.exerciseId);
      let running = Math.max(before ?? 0, sessionBest.get(ex.exerciseId) ?? 0);
      for (const s of ex.sets) {
        if (!isWorking(s)) continue;
        const v = e1rm(s.weight, s.reps);
        if (before !== undefined && v > running + 1e-9) prs.add(s.id);
        running = Math.max(running, v);
      }
      sessionBest.set(ex.exerciseId, Math.max(sessionBest.get(ex.exerciseId) ?? 0, running));
    }
    for (const [id, v] of sessionBest) best.set(id, Math.max(best.get(id) ?? 0, v));
  }
  prCache = { rev: historyVersion(), prs, best };
  return prCache;
}

export function isHistoryPR(setId: string): boolean {
  return prIndex().prs.has(setId);
}

export function workoutPRCount(w: Workout): number {
  const { prs } = prIndex();
  let n = 0;
  for (const ex of w.exercises) for (const s of ex.sets) if (prs.has(s.id)) n++;
  return n;
}

/** Rekordy w trwającym treningu, liczone względem całej historii. */
export function draftPRs(exercises: WorkoutExercise[]): Set<string> {
  const { best } = prIndex();
  const out = new Set<string>();
  const session = new Map<string, number>();
  for (const ex of exercises) {
    const before = best.get(ex.exerciseId);
    if (before === undefined) continue;
    let running = Math.max(before, session.get(ex.exerciseId) ?? 0);
    for (const s of ex.sets) {
      if (!isWorking(s)) continue;
      const v = e1rm(s.weight, s.reps);
      if (v > running + 1e-9) out.add(s.id);
      running = Math.max(running, v);
    }
    session.set(ex.exerciseId, running);
  }
  return out;
}

// ---------- Ostatni wynik ----------

/** Zaliczone serie z ostatniego treningu z tym ćwiczeniem. */
export function lastSets(exerciseId: string): SetEntry[] | null {
  for (const w of state.workouts) {
    const sets = w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter((s) => s.done));
    if (sets.length) return sets;
  }
  return null;
}

// ---------- Progres ćwiczenia ----------

export interface Point {
  date: number;
  e1rm: number;
  maxWeight: number;
  volume: number;
  maxReps: number;
  totalReps: number;
}

export function exerciseSeries(exerciseId: string): Point[] {
  const out: Point[] = [];
  for (let i = state.workouts.length - 1; i >= 0; i--) {
    const w = state.workouts[i];
    let best = 0;
    let maxW = 0;
    let vol = 0;
    let maxReps = 0;
    let totalReps = 0;
    let any = false;
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of ex.sets) {
        if (!isWorking(s)) continue;
        any = true;
        best = Math.max(best, e1rm(s.weight, s.reps));
        maxW = Math.max(maxW, s.weight ?? 0);
        vol += setVolume(s);
        maxReps = Math.max(maxReps, s.reps ?? 0);
        totalReps += s.reps ?? 0;
      }
    }
    if (any) out.push({ date: w.startedAt, e1rm: best, maxWeight: maxW, volume: vol, maxReps, totalReps });
  }
  return out;
}

export interface Records {
  bestE1rm: { value: number; weight: number; reps: number; date: number } | null;
  maxWeight: { weight: number; reps: number; date: number } | null;
  maxReps: { weight: number; reps: number; date: number } | null;
  bestVolume: { value: number; date: number } | null;
  sessions: number;
}

export function exerciseRecords(exerciseId: string): Records {
  const r: Records = { bestE1rm: null, maxWeight: null, maxReps: null, bestVolume: null, sessions: 0 };
  for (const w of state.workouts) {
    let vol = 0;
    let any = false;
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of ex.sets) {
        if (!isWorking(s)) continue;
        any = true;
        const weight = s.weight ?? 0;
        const reps = s.reps ?? 0;
        vol += weight * reps;
        const v = e1rm(weight, reps);
        if (v > 0 && (!r.bestE1rm || v > r.bestE1rm.value)) r.bestE1rm = { value: v, weight, reps, date: w.startedAt };
        if (!r.maxWeight || weight > r.maxWeight.weight || (weight === r.maxWeight.weight && reps > r.maxWeight.reps)) {
          r.maxWeight = { weight, reps, date: w.startedAt };
        }
        if (!r.maxReps || reps > r.maxReps.reps || (reps === r.maxReps.reps && weight > r.maxReps.weight)) {
          r.maxReps = { weight, reps, date: w.startedAt };
        }
      }
    }
    if (any) {
      r.sessions++;
      if (vol > 0 && (!r.bestVolume || vol > r.bestVolume.value)) r.bestVolume = { value: vol, date: w.startedAt };
    }
  }
  return r;
}

/** Ćwiczenia z historią, od ostatnio wykonanego. */
export function exercisesWithHistory(): string[] {
  const seen = new Set<string>();
  for (const w of state.workouts) {
    for (const ex of w.exercises) if (ex.sets.some(isWorking)) seen.add(ex.exerciseId);
  }
  return [...seen];
}

export function exerciseSetCount(exerciseId: string): number {
  let n = 0;
  for (const w of state.workouts) {
    for (const ex of w.exercises) if (ex.exerciseId === exerciseId) n += ex.sets.filter((s) => s.done).length;
  }
  return n;
}

// ---------- Tygodniowe ----------

export function muscleSets7d(now = Date.now()): Map<Muscle, number> {
  const from = now - 7 * 86_400_000;
  const out = new Map<Muscle, number>(MUSCLES.map((m) => [m, 0]));
  for (const w of state.workouts) {
    if (w.startedAt < from) break;
    for (const ex of w.exercises) {
      const muscle = getExercise(ex.exerciseId).muscle;
      out.set(muscle, (out.get(muscle) ?? 0) + ex.sets.filter(isWorking).length);
    }
  }
  return out;
}

export function weeklyCounts(weeks = 8, now = Date.now()): { week: number; count: number }[] {
  const current = startOfWeek(now);
  const out: { week: number; count: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(current);
    d.setDate(d.getDate() - i * 7);
    out.push({ week: d.getTime(), count: 0 });
  }
  const first = out[0].week;
  for (const w of state.workouts) {
    if (w.startedAt < first) break;
    const wk = startOfWeek(w.startedAt);
    const slot = out.find((o) => o.week === wk);
    if (slot) slot.count++;
  }
  return out;
}

export function lastDoneByPlan(): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of state.workouts) if (w.planId && !out.has(w.planId)) out.set(w.planId, w.startedAt);
  return out;
}

/** Następny trening w rotacji: ten po ostatnio wykonanym planie. */
export function nextPlanId(): string | null {
  if (!state.plans.length) return null;
  const last = state.workouts.find((w) => w.planId && state.plans.some((p) => p.id === w.planId));
  if (!last) return state.plans[0].id;
  const idx = state.plans.findIndex((p) => p.id === last.planId);
  return state.plans[(idx + 1) % state.plans.length].id;
}

/** Szacowany czas planu w minutach: średnia z ostatnich 3 wykonań, inaczej ~2,5 min na serię. */
export function planDuration(plan: { id: string; exercises: { sets: number }[] }): number {
  const recent = state.workouts.filter((w) => w.planId === plan.id).slice(0, 3);
  if (recent.length) {
    const avg = recent.reduce((s, w) => s + (w.endedAt - w.startedAt), 0) / recent.length / 60_000;
    return Math.max(5, Math.round(avg / 5) * 5);
  }
  const sets = plan.exercises.reduce((n, e) => n + e.sets, 0);
  return Math.max(10, Math.round((sets * 2.5 + 5) / 5) * 5);
}
